import { createApiClient } from "@geonarrate/api-client";
import { authFetch } from "./auth/session";

/** Client dùng chung cho mọi trang — tự gắn access token và tự refresh khi hết hạn. */
export const api = createApiClient("", { fetch: authFetch });
