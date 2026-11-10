import { useNavigate } from "react-router";
import { Church, Flower2, Landmark, MapPin, MessageSquare, PenLine, Radius, Settings2, Trees, type LucideIcon } from "lucide-react";
import { useCan } from "../auth/session";
import { categoryLabel } from "../labels";

const STATUS_CONFIG = {
  draft: { label: "Nháp", className: "bg-slate-100 text-slate-600" },
  in_review: { label: "Chờ duyệt", className: "bg-amber-100 text-amber-700" },
  approved: { label: "Đã duyệt", className: "bg-green-100 text-green-700" },
} as const;

const CATEGORY_ICON: Record<string, LucideIcon> = {
  temple: Flower2, church: Church, museum: Landmark, park: Trees, other: MapPin,
};

export function PoiCard({ poi }: { poi: any }) {
  // Người chỉ có quyền xem (vd. biên dịch viên) không thấy nút sửa
  const canWrite = useCan()("script:write");
  const navigate = useNavigate();
  const scriptStatus = poi.script_status as keyof typeof STATUS_CONFIG;
  const statusCfg = STATUS_CONFIG[scriptStatus] ?? STATUS_CONFIG.draft;
  const CategoryIcon = CATEGORY_ICON[poi.category] ?? MapPin;

  return (
    <div
      className="group bg-white hover:bg-teal-50/30 border border-slate-200 hover:border-teal-200 rounded-xl p-5 transition-all cursor-pointer shadow-sm"
      onClick={() => navigate(`/pois/${poi.id}/script`)}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-xl shrink-0">
            <CategoryIcon size={20} className="text-teal-700" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-slate-800 truncate">{poi.name}</h3>
              <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.className}`}>
                {statusCfg.label}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden /> {poi.lat.toFixed(4)}, {poi.lng.toFixed(4)}</span>
              <span className="inline-flex items-center gap-1"><Radius size={12} aria-hidden /> {poi.radius}m</span>
              <span title="Hai vùng chồng nhau thì điểm có số ưu tiên lớn hơn được phát trước">Ưu tiên {poi.priority}</span>
              <span>{categoryLabel(poi.category)}</span>
              <span title="Phiên bản script; tăng khi sửa script đã duyệt">Script v{poi.script_version}</span>
            </div>
          </div>
        </div>

        {canWrite && <div
          className="flex gap-2 shrink-0 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => navigate(`/pois/${poi.id}/script`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <PenLine size={13} aria-hidden /> {poi.review_note ? "Sửa kịch bản" : "Script"}
          </button>
          <button
            onClick={() => navigate(`/pois/${poi.id}/edit`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-lg transition-colors"
          >
            <Settings2 size={13} aria-hidden /> Sửa điểm
          </button>
        </div>}
      </div>

      {poi.review_note && (
        <div className="mt-3 p-2.5 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
          <MessageSquare size={13} className="inline-flex items-center gap-1.5 shrink-0" aria-hidden /> {poi.review_note}
        </div>
      )}
    </div>
  );
}
