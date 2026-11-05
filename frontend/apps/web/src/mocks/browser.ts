import { setupWorker } from "msw/browser";
import { attractionHandlers, authHandlers, passthroughHandlers } from "./handlers";

export const worker = setupWorker(
  ...passthroughHandlers,
  ...authHandlers,
  ...attractionHandlers,
);