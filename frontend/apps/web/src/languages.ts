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
