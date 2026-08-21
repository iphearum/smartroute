import { useState, type ReactNode } from "react";
import { FiCheck, FiCopy, FiDownload } from "react-icons/fi";

const LANGUAGE_ALIASES: Record<string, string> = {
  bash: "shell",
  html: "markup",
  javascript: "js",
  jsx: "js",
  python: "py",
  sh: "shell",
  tsx: "ts",
  typescript: "ts",
  xml: "markup",
  yml: "yaml",
};

const LANGUAGE_KEYWORDS: Record<string, string[]> = {
  css: ["important", "inherit", "initial", "none", "unset"],
  java: [
    "boolean",
    "class",
    "else",
    "extends",
    "final",
    "for",
    "if",
    "import",
    "int",
    "new",
    "null",
    "private",
    "public",
    "return",
    "static",
    "String",
    "try",
    "void",
    "while",
  ],
  js: [
    "as",
    "async",
    "await",
    "const",
    "else",
    "export",
    "from",
    "function",
    "if",
    "import",
    "let",
    "new",
    "return",
    "throw",
    "try",
    "var",
    "while",
  ],
  json: ["true", "false", "null"],
  markup: ["DOCTYPE"],
  py: [
    "and",
    "as",
    "class",
    "def",
    "elif",
    "else",
    "for",
    "from",
    "if",
    "import",
    "in",
    "is",
    "lambda",
    "None",
    "not",
    "or",
    "pass",
    "return",
    "True",
    "False",
    "try",
    "while",
    "with",
    "yield",
  ],
  shell: [
    "case",
    "do",
    "done",
    "elif",
    "else",
    "esac",
    "fi",
    "for",
    "function",
    "if",
    "in",
    "then",
    "while",
  ],
  ts: [
    "as",
    "async",
    "await",
    "class",
    "const",
    "else",
    "export",
    "extends",
    "from",
    "function",
    "if",
    "import",
    "interface",
    "let",
    "new",
    "return",
    "throw",
    "try",
    "type",
    "var",
    "while",
  ],
};

const FILE_EXTENSIONS: Record<string, string> = {
  css: "css",
  java: "java",
  js: "js",
  json: "json",
  markup: "html",
  py: "py",
  shell: "sh",
  ts: "ts",
};

function normalizeLanguage(language: string) {
  const name = language.trim().toLowerCase().split(/\s+/)[0] || "text";
  return (LANGUAGE_ALIASES[name] || name).replace(/[^a-z0-9-]/g, "-");
}

function highlightCode(value: string, language: string): ReactNode {
  const normalized = normalizeLanguage(language);
  const keywords = LANGUAGE_KEYWORDS[normalized] || [];
  const keywordPattern = keywords.length
    ? `\\b(?:${keywords.join("|")})\\b`
    : "(?!)";
  const pattern = new RegExp(
    [
      "(\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*|#[^\\n]*)",
      "(\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*')",
      "(\\b\\d+(?:\\.\\d+)?\\b)",
      `(${keywordPattern})`,
      "(\\b[A-Za-z_$][\\w$]*(?=\\s*\\())",
    ].join("|"),
    "g",
  );
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(value))) {
    if (match.index > cursor) parts.push(value.slice(cursor, match.index));
    const classNameMap: Record<number, string> = {
      1: "assistant-code-comment",
      2: "assistant-code-string",
      3: "assistant-code-number",
      4: "assistant-code-keyword",
    };
    const className = (match as any)[key] ? classNameMap[(match as any)[key]] : "assistant-code-function";
    parts.push(
      <span key={key++} className={className}>
        {match[0]}
      </span>,
    );
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) parts.push(value.slice(cursor));
  return <>{parts}</>;
}

export function AssistantCodeBlock({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  const normalized = normalizeLanguage(language);
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  const downloadCode = () => {
    const objectUrl = URL.createObjectURL(
      new Blob([code], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `assistant-code.${FILE_EXTENSIONS[normalized] || "txt"}`;
    link.click();
    URL.revokeObjectURL(objectUrl);
  };

  return (
    <div className={`assistant-code-block language-${normalized} rounded-xl`}>
      <div className="assistant-code-toolbar">
        <span>{language || "text"}</span>
        <div className="assistant-code-actions">
          <button
            type="button"
            onClick={() => void copyCode()}
            aria-label="Copy code"
            title={copied ? "Copied" : "Copy code"}
          >
            {copied ? (
              <FiCheck aria-hidden="true" />
            ) : (
              <FiCopy aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={downloadCode}
            aria-label="Download code"
            title="Download code"
          >
            <FiDownload aria-hidden="true" />
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto p-2 px-3 text-[11px] leading-relaxed">
        <code data-language={language || undefined}>
          {highlightCode(code, language)}
        </code>
      </pre>
    </div>
  );
}
