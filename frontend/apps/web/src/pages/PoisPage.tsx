import { useState } from "react";
import { List, Map as MapIcon, PenLine, Settings2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { sendJson } from "../api";
import { PoiCard } from "../components/PoiCard";
import { LoadError } from "../components/LoadError";
import { PoisMap } from "../components/PoisMap";
import { ghostBtn } from "../components/ui";
import { useCan } from "../auth/session";

const CATEGORIES = ["temple", "church", "museum", "park", "other"];

export function PoisPage() {
  const navigate = useNavigate();
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [view, setView] = useState<"list" | "map">("map");
  const [selectedId, setSelectedId] = useState<string>();
  const canWrite = useCan()("script:write");

  const { data, isLoading, error } = useQuery({
    queryKey: ["pois", category, status],
    queryFn: () =>
      sendJson<any[]>(
        `/api/v1/pois?${category ? `category=${category}&` : ""}${status ? `status=${status}` : ""}`
      ),
    retry: false,
  });
  const selected = data?.find((point) => point.id === selectedId);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Điểm tham quan</h1>
          {data && <p className="text-slate-500 text-sm mt-1">{data.length} địa điểm trong hệ thống</p>}
        </div>
        {canWrite && <button
          onClick={() => navigate("/pois/new")}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm"
        >
          + Thêm điểm
        </button>}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select aria-label="Lọc danh mục" value={category} onChange={(e) => setCategory(e.target.value)}
          className="bg-white border border-slate-200 text-slate-700 text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-sm">
          <option value="">Tất cả danh mục</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>


        <select aria-label="Lọc trạng thái" value={status} onChange={(e) => setStatus(e.target.value)}
          className="bg-white border border-slate-200 text-slate-700 text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-sm">
          <option value="">Tất cả trạng thái</option>
          <option value="draft">Nháp</option>
          <option value="in_review">Chờ duyệt</option>
          <option value="approved">Đã duyệt</option>
        </select>
        <div className="ml-auto flex gap-1" role="group" aria-label="Chế độ xem điểm tham quan">
          <button className={`${ghostBtn} ${view === "map" ? "ring-2 ring-teal-600" : ""}`} aria-pressed={view === "map"} onClick={() => setView("map")}><MapIcon size={15} aria-hidden /> Bản đồ</button>
          <button className={`${ghostBtn} ${view === "list" ? "ring-2 ring-teal-600" : ""}`} aria-pressed={view === "list"} onClick={() => setView("list")}><List size={15} aria-hidden /> Danh sách</button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-slate-400">
            <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            Đang tải...
          </div>
        </div>
      ) : error ? (
        <LoadError error={error} />
      ) : data?.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-xl">
          <MapIcon size={36} className="mx-auto mb-3 text-slate-300" aria-hidden />
          <p className="text-slate-400">Không có điểm nào.</p>
        </div>
      ) : view === "map" ? (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <PoisMap points={data ?? []} selectedId={selected?.id} onSelect={setSelectedId} />
          <aside className="rounded-xl border border-slate-200 bg-white p-4">
            {selected ? <div className="mb-4 border-b border-slate-100 pb-4">
              <h2 className="font-semibold text-slate-800">{selected.name}</h2>
              <p className="mt-1 text-xs text-slate-500">{selected.lat.toFixed(5)}, {selected.lng.toFixed(5)} · Vùng {selected.radius}m</p>
              {canWrite && <div className="mt-3 flex flex-wrap gap-2">
                <button className={ghostBtn} onClick={() => navigate(`/pois/${selected.id}/edit`)}><Settings2 size={14} aria-hidden /> Sửa điểm</button>
                <button className={ghostBtn} onClick={() => navigate(`/pois/${selected.id}/script`)}><PenLine size={14} aria-hidden /> Script</button>
              </div>}
            </div> : <p className="mb-3 text-sm text-slate-500">Chọn marker hoặc tên điểm để xem thông tin.</p>}
            <div className="max-h-[360px] space-y-1 overflow-y-auto" aria-label="Điểm trên bản đồ">
              {data?.map((point, index) => <button key={point.id} aria-pressed={selected?.id === point.id} onClick={() => setSelectedId(point.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${selected?.id === point.id ? "bg-teal-50 text-teal-800" : "text-slate-700 hover:bg-slate-50"}`}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs">{index + 1}</span><span>{point.name}</span>
              </button>)}
            </div>
          </aside>
        </div>
      ) : (
        <div className="grid gap-3">
          {data?.map((a: any) => <PoiCard key={a.id} poi={a} />)}
        </div>
      )}
    </div>
  );
}
