import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router";
import { RequireAuth, RequirePermission } from "./auth/guards";
import { AppShell } from "./layout/AppShell";
import { AuditPage } from "./pages/AuditPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { NAV } from "./routes";

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
                <PlaceholderPage title={item.label} />
              </RequirePermission>
            ),
          })),
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
