import { setupWorker } from "msw/browser";
import { poiHandlers, authHandlers, passthroughHandlers } from "./handlers";

export const worker = setupWorker(
  ...passthroughHandlers,
  ...authHandlers,
  ...poiHandlers,
);