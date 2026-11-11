import { useEffect, useState } from "react";
import { getLanguages } from "./api";

export interface LanguageOption {
  code: string;
  native_name: string;
}

/** Danh sách dự phòng khi chưa gọi được backend. */
export const OFFLINE_LANGUAGES: LanguageOption[] = [
  { code: "vi", native_name: "Tiếng Việt" },
  { code: "en", native_name: "English" },
  { code: "zh", native_name: "中文" },
  { code: "ja", native_name: "日本語" },
  { code: "ko", native_name: "한국어" },
];

export function languageName(code: string): string {
  return OFFLINE_LANGUAGES.find((language) => language.code === code)?.native_name ?? code.toUpperCase();
}

export function useLanguages(): { languages: LanguageOption[] | null; offline: boolean } {
  const [languages, setLanguages] = useState<LanguageOption[] | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let active = true;
    getLanguages()
      .then((list) => {
        if (active) setLanguages(list);
      })
      .catch(() => {
        if (!active) return;
        setLanguages(OFFLINE_LANGUAGES);
        setOffline(true);
      });
    return () => {
      active = false;
    };
  }, []);
  return { languages, offline };
}
