import { useQuery } from "@tanstack/react-query";
import { sendJson } from "./api";

export type Language = { code: string; bcp47: string; native_name: string; is_source: boolean };

export function useLanguages() {
  return useQuery({
    queryKey: ["languages"],
    queryFn: () => sendJson<Language[]>("/api/v1/languages"),
    retry: false,
  });
}

/** Tên hiển thị của ngôn ngữ, vd. "English (en)"; chưa tải xong thì trả mã. */
export function useLangName() {
  const { data } = useLanguages();
  return (code: string, withCode = true) => {
    const name = data?.find((l) => l.code === code)?.native_name;
    return name ? (withCode ? `${name} (${code})` : name) : code;
  };
}
