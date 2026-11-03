import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const CHARS_PER_SECOND = 14;
const MAX_CHARS = 600;

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}p ${s}s` : `${s}s`;
}

export function ScriptEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: attraction, isLoading } = useQuery({
    queryKey: ["attraction", id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/attractions/${id}`);
      return res.json();
    },
  });

  const [script, setScript] = useState("");

  useEffect(() => {
    if (attraction?.script) setScript(attraction.script);
  }, [attraction?.script]);

  const isDraft = attraction?.script_status === "draft";
  const charCount = script.length;
  const duration = charCount / CHARS_PER_SECOND;
  const isOverLimit = charCount > MAX_CHARS;
  const paragraphs = script.split("\n").filter(Boolean);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/attractions/${id}/script`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["attraction", id] }),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      await fetch(`/api/v1/attractions/${id}/script`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script }),
      });
      const res = await fetch(`/api/v1/attractions/${id}/submit`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).detail);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attraction", id] });
      queryClient.invalidateQueries({ queryKey: ["attractions"] });
    },
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-20 text-slate-400">Đang tải...</div>
  );

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/attractions")}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors"
          >
            ←
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{attraction?.name}</h1>
            <p className="text-slate-400 text-sm">Script tiếng Việt · v{attraction?.script_version}</p>
          </div>
        </div>

        <span className={`text-xs font-medium px-3 py-1 rounded-full ${
          attraction?.script_status === "approved" ? "bg-green-100 text-green-700" :
          attraction?.script_status === "in_review" ? "bg-amber-100 text-amber-700" :
          "bg-slate-100 text-slate-600"
        }`}>
          {attraction?.script_status === "approved" ? "✅ Đã duyệt" :
           attraction?.script_status === "in_review" ? "⏳ Chờ duyệt" : "📝 Draft"}
        </span>
      </div>

      {/* Review note */}
      {attraction?.review_note && (
        <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm font-semibold text-amber-800 mb-1">💬 Ghi chú từ người duyệt:</p>
          <p className="text-sm text-amber-700">{attraction.review_note}</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        {/* Counter */}
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-slate-700">
            Nội dung script
            <span className="text-slate-400 font-normal ml-1">(xuống dòng để tách đoạn)</span>
          </label>
          <div className="flex items-center gap-3 text-xs">
            <span className={`font-semibold ${isOverLimit ? "text-red-600" : charCount > MAX_CHARS * 0.8 ? "text-amber-600" : "text-slate-400"}`}>
              {charCount}/{MAX_CHARS} ký tự
            </span>
            <span className="text-slate-400">⏱ {formatDuration(duration)}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-100 rounded-full h-1 mb-3">
          <div
            className={`h-1 rounded-full transition-all ${isOverLimit ? "bg-red-500" : charCount > MAX_CHARS * 0.8 ? "bg-amber-500" : "bg-teal-500"}`}
            style={{ width: `${Math.min((charCount / MAX_CHARS) * 100, 100)}%` }}
          />
        </div>

        {/* Textarea */}
        <textarea
          value={script}
          onChange={(e) => isDraft && setScript(e.target.value)}
          readOnly={!isDraft}
          placeholder="Viết script thuyết minh tiếng Việt ở đây..."
          rows={10}
          className={`w-full px-4 py-3 rounded-lg border text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors ${
            isOverLimit ? "border-red-300 bg-red-50" :
            !isDraft ? "border-slate-200 bg-slate-50 cursor-not-allowed text-slate-500" :
            "border-slate-200 bg-white text-slate-800"
          }`}
        />

        {isOverLimit && (
          <p className="text-xs text-red-600 mt-1">⚠️ Vượt quá {MAX_CHARS} ký tự!</p>
        )}

        {/* Xem trước */}
        {paragraphs.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">
              👁️ Xem trước · {paragraphs.length} đoạn
            </h3>
            <div className="space-y-2">
              {paragraphs.map((p, i) => (
                <div key={i} className="p-3 bg-teal-50 rounded-lg border-l-2 border-teal-500">
                  <div className="flex gap-3 text-xs text-slate-400 mb-1">
                    <span>Đoạn {i + 1}</span>
                    <span>{p.length} ký tự</span>
                    <span>⏱ {formatDuration(p.length / CHARS_PER_SECOND)}</span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">{p}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Buttons */}
        {isDraft && (
          <div className="flex gap-3 mt-6 pt-5 border-t border-slate-100">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || isOverLimit}
              className="bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {saveMutation.isPending ? "Đang lưu..." : "💾 Lưu nháp"}
            </button>
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending || isOverLimit || charCount === 0}
              className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              {submitMutation.isPending ? "Đang gửi..." : "📤 Gửi duyệt"}
            </button>
          </div>
        )}

        {!isDraft && (
          <div className={`mt-5 p-3 rounded-lg text-sm ${
            attraction?.script_status === "in_review"
              ? "bg-amber-50 text-amber-700 border border-amber-200"
              : "bg-green-50 text-green-700 border border-green-200"
          }`}>
            {attraction?.script_status === "in_review"
              ? "⏳ Script đang chờ duyệt, không thể chỉnh sửa."
              : "✅ Script đã được duyệt."}
          </div>
        )}
      </div>
    </div>
  );
}