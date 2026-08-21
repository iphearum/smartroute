import { useEffect, useRef } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  FiArrowUp,
  FiCheck,
  FiCloudLightning,
  FiCode,
  FiCpu,
  FiGlobe,
  FiMic,
  FiPlus,
  FiShield,
  FiX,
  FiVolume2,
  FiVolumeX,
} from "react-icons/fi";
import { AssistantPermissionMenu } from "./assistant-permission-menu";
import { AssistantToolMenu } from "./assistant-tool-menu";
import {
  permissionOptions,
  type ChatAttachment,
  type ReasoningMode,
  type PermissionMode,
} from "./assistant-types";
import { BsLightbulb } from "react-icons/bs";
import { useI18n } from "@/features/i18n/use-i18n";

export function AssistantComposer({
  input,
  onInputChange,
  busy,
  connected,
  attachments,
  setAttachments,
  composerMenuOpen,
  setComposerMenuOpen,
  permissionMenuOpen,
  setPermissionMenuOpen,
  permissionMode,
  setPermissionMode,
  reasoningMode,
  setReasoningMode,
  thinkingMenuOpen,
  setThinkingMenuOpen,
  audioResponseEnabled,
  setAudioResponseEnabled,
  fileInputRef,
  onAddFiles,
  onSend,
  onMapAction,
  onWebSearch,
  onMapSearch,
}: {
  input: string;
  onInputChange: (value: string) => void;
  busy: boolean;
  connected: boolean;
  attachments: ChatAttachment[];
  setAttachments: Dispatch<SetStateAction<ChatAttachment[]>>;
  composerMenuOpen: boolean;
  setComposerMenuOpen: Dispatch<SetStateAction<boolean>>;
  permissionMenuOpen: boolean;
  setPermissionMenuOpen: Dispatch<SetStateAction<boolean>>;
  permissionMode: PermissionMode;
  setPermissionMode: (value: PermissionMode) => void;
  reasoningMode: ReasoningMode;
  setReasoningMode: (mode: ReasoningMode) => void;
  thinkingMenuOpen: boolean;
  setThinkingMenuOpen: Dispatch<SetStateAction<boolean>>;
  audioResponseEnabled: boolean;
  setAudioResponseEnabled: (enabled: boolean) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onAddFiles: (files: FileList | File[]) => void;
  onSend: () => void;
  onMapAction: (action: "reset" | "clear" | "focus") => void;
  onWebSearch: () => void;
  onMapSearch: () => void;
}) {
  const t = useI18n();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const focusAfterSendRef = useRef(false);

  useEffect(() => {
    if (!focusAfterSendRef.current || busy) return;
    focusAfterSendRef.current = false;
    inputRef.current?.focus();
  }, [busy, input]);

  const handleSend = () => {
    if (!connected || busy || (!input.trim() && !attachments.length)) return;
    focusAfterSendRef.current = true;
    onSend();
  };

  return (
    <div className="assistant-composer bg-transparent p-3">
      {composerMenuOpen && (
        <AssistantToolMenu
          onAddFiles={() => {
            setComposerMenuOpen(false);
            fileInputRef.current?.click();
          }}
          onMapSearch={() => {
            onMapSearch();
            setComposerMenuOpen(false);
          }}
          onWebSearch={() => {
            onWebSearch();
            setComposerMenuOpen(false);
          }}
          onPermissions={() => {
            setComposerMenuOpen(false);
            setPermissionMenuOpen(true);
          }}
          onMapAction={(action) => {
            onMapAction(action);
            setComposerMenuOpen(false);
          }}
        />
      )}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*,.txt,.md,.json,.csv,.ts,.tsx,.js,.py,.css,.html,.pdf"
        onChange={(event) => {
          if (event.target.files) onAddFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <div
        className={`assistant-composer-shell ${attachments.length ? "has-attachments" : ""}`}
      >
        {permissionMenuOpen && (
          <AssistantPermissionMenu
            value={permissionMode}
            onChange={(value) => {
              setPermissionMode(value);
              setPermissionMenuOpen(false);
            }}
          />
        )}
        {thinkingMenuOpen && (
          <div
            className="assistant-thinking-menu"
            role="menu"
            aria-label={t("assistant.thinkingMode", "Thinking mode")}
          >
            <div className="assistant-thinking-menu-header">
              {t("assistant.thinkingMode", "Thinking mode")}
            </div>
            {(["auto", "high", "off"] as ReasoningMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={
                  "assistant-thinking-option" +
                  (reasoningMode === mode ? " selected" : "")
                }
                role="menuitemradio"
                aria-checked={reasoningMode === mode}
                onClick={() => {
                  setReasoningMode(mode);
                  setThinkingMenuOpen(false);
                }}
              >
                <span className="assistant-thinking-option-copy">
                  <strong>{reasoningModeLabel(mode, t)}</strong>
                  <span>
                    {mode === "auto"
                      ? t(
                          "assistant.reasoningAutoDescription",
                          "Balanced reasoning for most requests",
                        )
                      : mode === "high"
                        ? t(
                            "assistant.reasoningHighDescription",
                            "Deeper reasoning for complex tasks",
                          )
                        : t(
                            "assistant.reasoningOffDescription",
                            "Respond without extra reasoning",
                          )}
                  </span>
                </span>
                {reasoningMode === mode && (
                  <FiCheck
                    className="assistant-thinking-option-check"
                    aria-hidden="true"
                  />
                )}
              </button>
            ))}
          </div>
        )}
        <AttachmentPreview
          attachments={attachments}
          setAttachments={setAttachments}
        />
        <textarea
          ref={inputRef}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.items)
              .filter((item) => item.kind === "file")
              .map((item) => item.getAsFile())
              .filter((file): file is File => file !== null);
            if (!files.length) return;
            event.preventDefault();
            onAddFiles(files);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          placeholder={
            busy
              ? t("assistant.thinking", "Thinking…")
              : t("assistant.placeholder", "Message with PsarAI…")
          }
          aria-label={t("assistant.messageAriaLabel", "Message with PsarAI")}
          disabled={busy}
          rows={1}
          className="assistant-composer-input"
        />
        <div className="assistant-composer-row">
          <button
            type="button"
            className="assistant-composer-icon"
            onClick={() => setComposerMenuOpen((open) => !open)}
            aria-label={t("assistant.openActions", "Open map actions")}
            aria-expanded={composerMenuOpen}
          >
            <FiPlus aria-hidden="true" />
          </button>
          <div className="assistant-composer-meta">
            <button
              type="button"
              className="assistant-composer-permission"
              onClick={() => setPermissionMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={permissionMenuOpen}
            >
              <FiShield aria-hidden="true" />
              {
                permissionOptions.find((option) => option.id === permissionMode)
                  ?.title
              }
            </button>
            {/* <span className="assistant-composer-model">PsarAI 2B</span>
            <span className="assistant-composer-divider" aria-hidden="true" />
            <span className="assistant-composer-context">
              <button
                type="button"
                className="assistant-composer-capability active"
                onClick={() => onInputChange(input || "Find ")}
              >
                <FiGlobe aria-hidden="true" /> Search
              </button>
              <button
                type="button"
                className="assistant-composer-capability"
                disabled
              >
                <FiCode aria-hidden="true" /> Code
              </button>
            </span> */}
          </div>
          <button
            type="button"
            className={[
              "assistant-composer-thinking",
              reasoningMode !== "off" ? "is-enabled" : "",
              reasoningMode === "high" ? "is-high" : "",
              busy ? "is-busy" : "",
            ].join(" ")}
            onClick={() => setThinkingMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={thinkingMenuOpen}
            aria-label={`${t(
              "assistant.reasoningModeDescription",
              "Reasoning: off, automatic, or always on",
            )} — ${reasoningModeLabel(reasoningMode, t)}`}
            title={t(
              "assistant.reasoningModeDescription",
              "Reasoning: off, automatic, or always on",
            )}
          >
            <BsLightbulb aria-hidden="true" />
            {busy && reasoningMode !== "off"
              ? t("assistant.thinking", "Thinking…")
              : reasoningModeLabel(reasoningMode, t)}
          </button>
          <button
            type="button"
            className={`assistant-composer-audio ${audioResponseEnabled ? "is-enabled" : ""}`}
            onClick={() => setAudioResponseEnabled(!audioResponseEnabled)}
            aria-pressed={audioResponseEnabled}
            aria-label={
              audioResponseEnabled
                ? "Disable automatic audio responses"
                : "Enable automatic audio responses"
            }
            title={
              audioResponseEnabled
                ? "Disable automatic audio responses"
                : "Enable automatic audio responses"
            }
          >
            {audioResponseEnabled ? (
              <FiVolume2 aria-hidden="true" />
            ) : (
              <FiVolumeX aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="assistant-composer-mic"
            disabled
            aria-label="Voice input is not available yet"
          >
            <FiMic aria-hidden="true" />
          </button>
          <button
            type="button"
            className="assistant-composer-send"
            onClick={handleSend}
            disabled={
              !connected || busy || (!input.trim() && !attachments.length)
            }
            aria-label={t("assistant.sendAriaLabel", "Send message")}
          >
            <FiArrowUp aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="sr-only">
        {t(
          "assistant.composerHint",
          "Enter to send, Shift+Enter for a new line, paste images or files with Ctrl+V, up to 5 files",
        )}
      </p>
    </div>
  );
}

function AttachmentPreview({
  attachments,
  setAttachments,
}: {
  attachments: ChatAttachment[];
  setAttachments: Dispatch<SetStateAction<ChatAttachment[]>>;
}) {
  if (!attachments.length) return null;
  return (
    <div className="assistant-composer-attachments">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="assistant-composer-attachment">
          {attachment.dataUrl ? (
            <img
              src={attachment.dataUrl}
              alt=""
              className="assistant-composer-attachment-image"
            />
          ) : (
            <span className="assistant-composer-attachment-file">FILE</span>
          )}
          <span className="assistant-composer-attachment-name">
            {attachment.name}
          </span>
          <button
            type="button"
            className="assistant-composer-attachment-remove"
            onClick={() =>
              setAttachments((current) =>
                current.filter((item) => item.id !== attachment.id),
              )
            }
            aria-label={`Remove ${attachment.name}`}
          >
            <FiX aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}

const REASONING_ORDER: ReasoningMode[] = ["auto", "high", "off"];

function nextReasoningMode(mode: ReasoningMode): ReasoningMode {
  const index = REASONING_ORDER.indexOf(mode);
  return REASONING_ORDER[(index + 1) % REASONING_ORDER.length];
}

function reasoningModeLabel(
  mode: ReasoningMode,
  t: (key: string, fallback?: string) => string,
): string {
  if (mode === "off") return t("assistant.reasoningOff", "No thinking");
  if (mode === "high") return t("assistant.reasoningHigh", "Always thinking");
  return t("assistant.reasoningAuto", "Auto thinking");
}
