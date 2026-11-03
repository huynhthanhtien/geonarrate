import { useNavigate } from "react-router";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600" },
  in_review: { label: "Chờ duyệt", className: "bg-amber-100 text-amber-700" },
  approved: { label: "Đã duyệt", className: "bg-green-100 text-green-700" },
};

const CATEGORY_ICON: Record<string, string> = {
  temple: "🛕", church: "⛪", museum: "🏛️", park: "🌳", other: "📍",
};

export function AttractionCard({ attraction }: { attraction: any }) {
  const navigate = useNavigate();
  const statusCfg = STATUS_CONFIG[attraction.script_status] ?? STATUS_CONFIG.draft;
  const icon = CATEGORY_ICON[attraction.category] ?? "📍";

  return (
    <div
      className="group bg-white hover:bg-teal-50/30 border border-slate-200 hover:border-teal-200 rounded-xl p-5 transition-all cursor-pointer shadow-sm"
      onClick={() => navigate(`/attractions/${attraction.id}/script`)}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-xl shrink-0">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-slate-800 truncate">{attraction.name}</h3>
              <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.className}`}>
                {statusCfg.label}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
              <span>📍 {attraction.lat.toFixed(4)}, {attraction.lng.toFixed(4)}</span>
              <span>⭕ {attraction.radius}m</span>
              <span>ưu tiên #{attraction.priority}</span>
              <span>v{attraction.script_version}</span>
            </div>
          </div>
        </div>

        <div
          className="flex gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => navigate(`/attractions/${attraction.id}/script`)}
            className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-lg transition-colors"
          >
            ✍️ Script
          </button>
          <button className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 text-xs font-medium rounded-lg transition-colors border border-red-100">
            Xoá
          </button>
        </div>
      </div>

      {attraction.review_note && (
        <div className="mt-3 p-2.5 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
          💬 {attraction.review_note}
        </div>
      )}
    </div>
  );
}