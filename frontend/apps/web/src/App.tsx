import type { ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router";
import { RequireAuth, RequirePermission } from "./auth/guards";
import { AppShell } from "./layout/AppShell";
import { AccountsPage } from "./pages/AccountsPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { PoiFormPage } from "./pages/PoiFormPage";
import { PoisPage } from "./pages/PoisPage";
import { AuditPage } from "./pages/AuditPage";
import { GlossaryPage } from "./pages/GlossaryPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PacksPage } from "./pages/PacksPage";
import { ReviewsPage } from "./pages/ReviewsPage";
import { ScriptEditorPage } from "./pages/ScriptEditorPage";
import { TicketsPage } from "./pages/TicketsPage";
import { ToursPage } from "./pages/ToursPage";
import { TranslationsPage } from "./pages/TranslationsPage";
import { VoiceStudioPage } from "./pages/VoiceStudioPage";
import { NAV } from "./routes";

const PAGES: Record<string, ReactNode> = {
  "/pois": <PoisPage />,
  "/reviews": <ReviewsPage />,
  "/translations": <TranslationsPage />,
  "/glossaries": <GlossaryPage />,
  "/studio/voice": <VoiceStudioPage />,
  "/tours": <ToursPage />,
  "/packs": <PacksPage />,
  "/tickets": <TicketsPage />,
  "/analytics": <AnalyticsPage />,
  "/accounts": <AccountsPage />,
};

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          ...NAV.filter((item) => item.path !== "/" && item.path !== "/admin").map((item) => ({
            path: item.path,
            element: (
              <RequirePermission permission={item.permission}>
                {PAGES[item.path]}
              </RequirePermission>
            ),
          })),
          {
            path: "/pois/new",
            element: (
              <RequirePermission permission="poi:write">
                <PoiFormPage />
              </RequirePermission>
            ),
          },
          {
            path: "/pois/:id/edit",
            element: (
              <RequirePermission permission="poi:write">
                <PoiFormPage />
              </RequirePermission>
            ),
          },
          {
            path: "/pois/:id/script",
            element: (
              <RequirePermission permission="script:write">
                <ScriptEditorPage />
              </RequirePermission>
            ),
          },
          {
            path: "/admin",
            element: (
              <RequirePermission permission="audit:read">
                <Outlet />
              </RequirePermission>
            ),
            children: [
              { index: true, element: <Navigate to="audit" replace /> },
              { path: "audit", element: <AuditPage /> },
            ],
          },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
