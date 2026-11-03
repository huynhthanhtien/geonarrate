import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { AttractionsPage } from "./pages/AttractionsPage";
import { AttractionFormPage } from "./pages/AttractionFormPage";
import { ScriptEditorPage } from "./pages/ScriptEditorPage";
import { ReviewsPage } from "./pages/ReviewsPage";

function SidebarLink({ to, icon, label, badge }: { to: string; icon: string; label: string; badge?: number }) {
  const location = useLocation();
  const active = location.pathname === to || (to !== "/" && location.pathname.startsWith(to));
  return (
    <Link to={to} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
      active ? "bg-teal-600 text-white shadow-sm shadow-teal-200" : "text-slate-600 hover:bg-teal-50 hover:text-teal-700"
    }`}>
      <span className="text-lg">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="bg-teal-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{badge}</span>
      )}
    </Link>
  );
}

function Layout() {
  const { data: pendingReviews } = useQuery({
    queryKey: ["attractions", "", "in_review"],
    queryFn: async () => {
      const res = await fetch("/api/v1/attractions?status=in_review");
      return res.json();
    },
  });

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white flex flex-col shadow-sm">
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-base shadow-md">
              🎧
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm">GeoNarrate</p>
              <p className="text-slate-400 text-xs">CMS Dashboard</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider px-3 py-2">Menu</p>
          <SidebarLink to="/" icon="🏠" label="Tổng quan" />
          <SidebarLink to="/attractions" icon="🗺️" label="Điểm tham quan" />
          <SidebarLink to="/reviews" icon="📋" label="Duyệt script" badge={pendingReviews?.length ?? 0} />
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-xs font-bold text-white">
              E
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">Editor</p>
              <p className="text-xs text-slate-400">editor@test.com</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-slate-200 bg-white flex items-center px-6 shrink-0 shadow-sm">
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />
            MSW mock · dev mode
          </div>
        </header>

        <main className="flex-1 p-8 overflow-auto">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/attractions" element={<AttractionsPage />} />
            <Route path="/attractions/new" element={<AttractionFormPage />} />
            <Route path="/attractions/:id/script" element={<ScriptEditorPage />} />
            <Route path="/reviews" element={<ReviewsPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function HomePage() {
  const { data: attractions } = useQuery({
    queryKey: ["attractions", "", ""],
    queryFn: async () => {
      const res = await fetch("/api/v1/attractions");
      return res.json();
    },
  });

  const { data: pending } = useQuery({
    queryKey: ["attractions", "", "in_review"],
    queryFn: async () => {
      const res = await fetch("/api/v1/attractions?status=in_review");
      return res.json();
    },
  });

  const { data: approved } = useQuery({
    queryKey: ["attractions", "", "approved"],
    queryFn: async () => {
      const res = await fetch("/api/v1/attractions?status=approved");
      return res.json();
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Tổng quan</h1>
      <p className="text-slate-500 text-sm mb-8">Chào mừng trở lại, Editor 👋</p>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Điểm tham quan", value: attractions?.length ?? 0, icon: "🗺️", bg: "bg-teal-50", border: "border-teal-200", text: "text-teal-700" },
          { label: "Chờ duyệt", value: pending?.length ?? 0, icon: "⏳", bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700" },
          { label: "Đã duyệt", value: approved?.length ?? 0, icon: "✅", bg: "bg-green-50", border: "border-green-200", text: "text-green-700" },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-5`}>
            <div className="text-2xl mb-3">{s.icon}</div>
            <p className={`text-3xl font-bold ${s.text} mb-1`}>{s.value}</p>
            <p className="text-slate-500 text-sm">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-600 mb-4">Thao tác nhanh</h2>
        <div className="flex gap-3">
          <Link to="/attractions/new"
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
            + Thêm điểm mới
          </Link>
          <Link to="/reviews"
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            📋 Xem hàng duyệt
          </Link>
        </div>
      </div>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}