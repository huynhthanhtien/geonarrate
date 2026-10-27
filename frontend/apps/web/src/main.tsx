import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { refreshSession } from "./auth/session";

const queryClient = new QueryClient();
// Khôi phục phiên từ refresh token đã lưu (gọi một lần ở đây, không trong effect)
void refreshSession();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
