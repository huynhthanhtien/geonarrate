import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

export type Schemas = components["schemas"];
export type Language = Schemas["LanguageOut"];

/** Client có kiểu, sinh từ backend/openapi.json — không viết tay. */
export function createApiClient(baseUrl = "") {
  return createClient<paths>({ baseUrl });
}
