"use client";

import { useAppShell } from "@/shared/state/app-shell-context";
import { useI18n } from "@/features/i18n/use-i18n";

export function LanguageSwitcher() {
  const language = useAppShell((state) => state.language);
  const setLanguage = useAppShell((state) => state.setLanguage);
  const t = useI18n();
  const languages = [
    ["en", t("common.english", "English")],
    ["km", t("common.khmer", "ខ្មែរ")],
  ] as const;

  return (
    <div
      className="language-switcher mb-1"
      aria-label={t("common.language", "Language")}
    >
      {languages.map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => setLanguage(value)}
          className={`language-switcher-option ${language === value ? "active" : ""}`}
          aria-pressed={language === value}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
