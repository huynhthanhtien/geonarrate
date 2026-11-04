import createClient, { type ClientOptions } from "openapi-fetch";
import type { components, paths } from "./schema";

export type Schemas = components["schemas"];
export type Language = Schemas["LanguageOut"];
export type TokenOut = Schemas["TokenOut"];
export type UserOut = Schemas["UserOut"];
export type AuditLog = Schemas["AuditLogOut"];

/** Client có kiểu, sinh từ backend/openapi.json — không viết tay. */
export function createApiClient(baseUrl = "", options: Omit<ClientOptions, "baseUrl"> = {}) {
  return createClient<paths>({ ...options, baseUrl });
}
