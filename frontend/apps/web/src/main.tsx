import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { refreshSession } from "./auth/session";
import "./index.css";

const queryClient = new QueryClient();
/** Mặc định dùng backend thật; muốn chạy không cần backend thì đặt VITE_USE_MSW=true. */
async function enableMocking() {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MSW === "true") {
    const { worker } = await import("./mocks/browser");
    return worker.start();
  }
  // Gỡ service worker MSW còn sót từ lần chạy mock trước
  if ("serviceWorker" in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.filter((r) => r.active?.scriptURL.endsWith("mockServiceWorker.js")).map((r) => r.unregister()));
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