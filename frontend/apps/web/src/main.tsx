import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { refreshSession } from "./auth/session";
import "./index.css";

const queryClient = new QueryClient();
async function enableMocking() {
  if (import.meta.env.DEV) {
    const { worker } = await import("./mocks/browser");
    return worker.start();
  }
}

enableMocking().then(() => {
  // Khôi phục phiên từ refresh token đã lưu (gọi một lần ở đây, không trong effect).
  // Phải chạy sau khi MSW sẵn sàng, nếu không token mock sẽ bị gửi tới backend thật.
  void refreshSession();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>
  );
});