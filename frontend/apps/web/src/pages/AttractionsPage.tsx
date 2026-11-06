import { useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { sendJson } from "../api";
import { AttractionCard } from "../components/AttractionCard";
import { LoadError } from "../components/LoadError";

const CATEGORIES = ["temple", "church", "museum", "park", "other"];

export function AttractionsPage() {
  const navigate = useNavigate();
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["attractions", category, status],
    queryFn: () =>
      sendJson<any[]>(
        `/api/v1/attractions?${category ? `category=${category}&` : ""}${status ? `status=${status}` : ""}`
      ),
    retry: false,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Điểm tham quan</h1>
          {data && <p className="text-slate-500 text-sm mt-1">{data.length} địa điểm trong hệ thống</p>}
        </div>
        <button
          onClick={() => navigate("/attractions/new")}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm"
        >
          + Thêm điểm
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="bg-white border border-slate-200 text-slate-700 text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-sm">
          <option value="">Tất cả danh mục</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="bg-white border border-slate-200 text-slate-700 text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-sm">
          <option value="">Tất cả trạng thái</option>
          <option value="draft">Nháp</option>
          <option value="in_review">Chờ duyệt</option>
          <option value="approved">Đã duyệt</option>
        </select>
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
      ) : (
        <div className="grid gap-3">
          {data?.map((a: any) => <AttractionCard key={a.id} attraction={a} />)}
        </div>
      )}
    </div>
  );
}