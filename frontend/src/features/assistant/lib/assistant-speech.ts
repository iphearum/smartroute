const API_PATH = "/api/backend/assistant/speech/chunk";
const KHMER_RE = /[\u1780-\u17ff\u19e0-\u19ff]/;
const SENTENCE_RE = /[^.!?។]+[.!?។]+|[^.!?។]+$/g;
const SCRIPT_RE = /[\u1780-\u17ff\u19e0-\u19ff]+|[^\u1780-\u17ff\u19e0-\u19ff]+/g;
const MAX_CHUNK_LENGTH = 280;

let speechRun = 0;
let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;
let streamingText = "";
let streamingQueue: string[] = [];
let drainingStreamingQueue = false;
const speechControllers = new Set<AbortController>();

export function splitSpeechText(text: string) {
  return (text.match(SENTENCE_RE) || [text])
    .flatMap((sentence) => sentence.match(SCRIPT_RE) || [])
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap(splitLongChunk);
}

function splitLongChunk(text: string) {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += MAX_CHUNK_LENGTH) {
    chunks.push(text.slice(index, index + MAX_CHUNK_LENGTH));
  }
  return chunks;
}

export function stopAssistantSpeech() {
  speechRun += 1;
  streamingText = "";
  streamingQueue = [];
  speechControllers.forEach((controller) => controller.abort());
  speechControllers.clear();
  const audio = activeAudio;
  activeAudio = null;
  audio?.pause();
  // `pause()` does not fire `ended`, so explicitly settle the playback
  // promise and allow a later streaming response to start a fresh drain.
  audio?.onended?.(new Event("ended"));
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
  activeObjectUrl = null;
}

export function beginStreamingSpeech() {
  stopAssistantSpeech();
}

function queueScriptSegments(text: string) {
  streamingQueue.push(
    ...((text.match(SCRIPT_RE) || []) as string[])
      .map((part) => part.trim())
      .filter(Boolean),
  );
  streamingQueue = streamingQueue.flatMap(splitLongChunk);
}

export function enqueueStreamingSpeech(delta: string) {
  streamingText += delta;
  const completed = streamingText.match(/[\s\S]+?[.!?។](?:\s|$)/g) || [];
  if (!completed.length) return;
  const consumed = completed.join("");
  streamingText = streamingText.slice(consumed.length);
  completed.forEach(queueScriptSegments);
  void drainStreamingSpeech();
}

export function finishStreamingSpeech() {
  if (streamingText.trim()) queueScriptSegments(streamingText);
  streamingText = "";
  void drainStreamingSpeech();
}

async function drainStreamingSpeech() {
  if (drainingStreamingQueue) return;
  drainingStreamingQueue = true;
  const run = speechRun;
  let nextBlob: Promise<Blob> | null = null;
  try {
    while (streamingQueue.length && run === speechRun) {
      const chunk = streamingQueue.shift()!;
      const currentBlob = nextBlob || requestSpeechBlob(chunk, run);
      const nextChunk = streamingQueue[0];
      nextBlob = nextChunk ? requestSpeechBlob(nextChunk, run) : null;
      await playSpeechBlob(await currentBlob, run);
    }
  } catch {
    // Automatic speech is an enhancement; a failed chunk must not break the
    // assistant stream or create an unhandled promise rejection.
    streamingQueue = [];
  } finally {
    drainingStreamingQueue = false;
  }
}

async function requestSpeechBlob(chunk: string, run: number) {
  const language = KHMER_RE.test(chunk) ? "km" : "en";
  const controller = new AbortController();
  speechControllers.add(controller);
  try {
    const response = await fetch(API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: chunk.slice(0, 280), language }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Speech chunk request failed");
    if (run !== speechRun) throw new DOMException("Speech cancelled", "AbortError");
    return await response.blob();
  } finally {
    speechControllers.delete(controller);
  }
}

async function playSpeechBlob(blob: Blob, run: number) {
  if (run !== speechRun) return;
  const objectUrl = URL.createObjectURL(blob);
  activeObjectUrl = objectUrl;
  const audio = new Audio(objectUrl);
  activeAudio = audio;
  try {
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("Speech playback failed"));
      void audio.play().catch(reject);
    });
  } finally {
    audio.pause();
    URL.revokeObjectURL(objectUrl);
    activeAudio = null;
    activeObjectUrl = null;
  }
}

export async function speakAssistantSpeech(text: string) {
  stopAssistantSpeech();
  const run = speechRun;
  let nextBlob: Promise<Blob> | null = null;
  const chunks = splitSpeechText(text);

  for (let index = 0; index < chunks.length; index += 1) {
    if (run !== speechRun) return;
    const currentBlob = nextBlob || requestSpeechBlob(chunks[index], run);
    nextBlob = chunks[index + 1]
      ? requestSpeechBlob(chunks[index + 1], run)
      : null;
    await playSpeechBlob(await currentBlob, run);
  }
}
