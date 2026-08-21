import type { ElementType, ReactNode } from "react";
import { AssistantCodeBlock } from "./assistant-code-block";

const INLINE_MARKDOWN =
  /(\!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*]+)\*|_([^_]+)_)/g;

function safeUrl(value: string, allowRelative = false) {
  const url = value.trim();
  if (/^(https?:\/\/|mailto:)/i.test(url)) return url;
  if (allowRelative && /^(\/|#)/.test(url)) return url;
  return null;
}

function removeAssistantProtocol(value: string) {
  return value
    .replace(
      /<(?:tool_call|function|tool[a-z_]*)\b[\s\S]*?<\/(?:tool_call|function|tool[a-z_]*)\s*>/gi,
      "",
    )
    .replace(/<(?:tool_call|function|tool[a-z_]*)\b[\s\S]*$/i, "")
    .replace(/<\/?(?:parameter|tool_call|function|tool[a-z_]*)[^>]*>/gi, "")
    .trim();
}

function InlineMarkdown({ value }: { value: string }) {
  const children: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_MARKDOWN.exec(value))) {
    if (match.index > cursor) children.push(value.slice(cursor, match.index));
    const [
      raw,
      imageAlt,
      imageUrl,
      linkText,
      linkUrl,
      code,
      bold,
      boldAlt,
      strike,
      italic,
      italicAlt,
    ] = match;

    if (imageUrl) {
      const src = safeUrl(imageUrl, true);
      children.push(
        src ? (
          <img
            key={key++}
            src={src}
            alt={imageAlt || ""}
            className="my-2 max-h-56 max-w-full rounded-xl object-contain"
          />
        ) : (
          raw
        ),
      );
    } else if (linkUrl) {
      const href = safeUrl(linkUrl);
      children.push(
        href ? (
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-2"
          >
            {linkText}
          </a>
        ) : (
          raw
        ),
      );
    } else if (code) {
      children.push(
        <code
          key={key++}
          className="rounded-md bg-slate-900/10 px-1.5 py-0.5 font-mono text-[0.9em] text-slate-800"
        >
          {code}
        </code>,
      );
    } else if (bold || boldAlt) {
      children.push(<strong key={key++}>{bold || boldAlt}</strong>);
    } else if (strike) {
      children.push(<del key={key++}>{strike}</del>);
    } else if (italic || italicAlt) {
      children.push(<em key={key++}>{italic || italicAlt}</em>);
    }
    cursor = match.index + raw.length;
  }

  if (cursor < value.length) children.push(value.slice(cursor));
  return <>{children}</>;
}

type ListState = { ordered: boolean; items: string[] } | null;

function renderLines(lines: string[]): ReactNode[] {
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: ListState = null;
  let key = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(
      <p key={key++} className="leading-relaxed">
        <InlineMarkdown value={paragraph.join("\n")} />
      </p>,
    );
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    const List = list.ordered ? "ol" : "ul";
    blocks.push(
      <List
        key={key++}
        className={`${list.ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5`}
      >
        {list.items.map((item, index) => (
          <li key={index}>
            <InlineMarkdown value={item} />
          </li>
        ))}
      </List>,
    );
    list = null;
  };

  lines.forEach((line) => {
    if (!line.trim()) {
      flushParagraph();
      flushList();
      return;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const Heading = `h${heading[1].length}` as ElementType;
      blocks.push(
        <Heading
          key={key++}
          className="font-extrabold text-slate-900 first:mt-0"
        >
          <InlineMarkdown value={heading[2]} />
        </Heading>,
      );
      return;
    }

    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const orderedList = Boolean(ordered);
      if (!list || list.ordered !== orderedList) {
        flushList();
        list = { ordered: orderedList, items: [] };
      }
      list.items.push((unordered || ordered)![1]);
      return;
    }

    flushList();
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      blocks.push(
        <blockquote
          key={key++}
          className="border-l-2 border-emerald-400/60 pl-3 italic text-slate-600"
        >
          <InlineMarkdown value={quote[1]} />
        </blockquote>,
      );
      return;
    }
    paragraph.push(line);
  });

  flushParagraph();
  flushList();
  return blocks;
}

export function MarkdownMessage({ value }: { value: string }) {
  const lines = removeAssistantProtocol(value.replace(/\r\n?/g, "\n")).split(
    "\n",
  );
  const blocks: ReactNode[] = [];
  let normalLines: string[] = [];
  let codeLines: string[] = [];
  let insideCodeBlock = false;
  let language = "";
  let key = 0;

  const flushNormal = () => {
    if (!normalLines.length) return;
    blocks.push(
      ...renderLines(normalLines).map((block) => (
        <span key={key++} className="contents">
          {block}
        </span>
      )),
    );
    normalLines = [];
  };

  lines.forEach((line) => {
    const fence = /^\s*```(.*)$/.exec(line);
    if (!fence) {
      if (insideCodeBlock) codeLines.push(line);
      else normalLines.push(line);
      return;
    }

    if (insideCodeBlock) {
      blocks.push(
        <AssistantCodeBlock
          key={key++}
          code={codeLines.join("\n")}
          language={language}
        />,
      );
      insideCodeBlock = false;
      language = "";
      return;
    }

    flushNormal();
    insideCodeBlock = true;
    codeLines = [];
    language = fence[1].trim();
  });

  if (insideCodeBlock) {
    blocks.push(
      <AssistantCodeBlock
        key={key++}
        code={codeLines.join("\n")}
        language={language}
      />,
    );
  } else {
    flushNormal();
  }

  return <div className="assistant-markdown grid gap-2">{blocks}</div>;
}
