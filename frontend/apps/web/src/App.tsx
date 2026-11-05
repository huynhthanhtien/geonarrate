import type { ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router";
import { RequireAuth, RequirePermission } from "./auth/guards";
import { AppShell } from "./layout/AppShell";
import { AttractionFormPage } from "./pages/AttractionFormPage";
import { AttractionsPage } from "./pages/AttractionsPage";
import { AuditPage } from "./pages/AuditPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { ReviewsPage } from "./pages/ReviewsPage";
import { ScriptEditorPage } from "./pages/ScriptEditorPage";
import { NAV } from "./routes";

/** Trang đã làm xong; mục NAV chưa có ở đây thì hiện PlaceholderPage. */
const PAGES: Record<string, ReactNode> = {
  "/attractions": <AttractionsPage />,
  "/reviews": <ReviewsPage />,
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
                {PAGES[item.path] ?? <PlaceholderPage title={item.label} />}
              </RequirePermission>
            ),
          })),
          {
            path: "/attractions/new",
            element: (
              <RequirePermission permission="script:write">
                <AttractionFormPage />
              </RequirePermission>
            ),
          },
          {
            path: "/attractions/:id/script",
            element: (
              <RequirePermission permission="script:write">
                <ScriptEditorPage />
              </RequirePermission>
            ),
          },
          {
            path: "/admin",
            element: (
              <RequirePermission permission="admin:manage">
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
