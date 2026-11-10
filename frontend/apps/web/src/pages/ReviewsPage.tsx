import { useState } from "react";
import { Check, CheckCheck, Eye, EyeOff, FileText, Hourglass, Tag, Undo2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Schemas } from "@geonarrate/api-client";
import { sendJson } from "../api";
import { LoadError } from "../components/LoadError";

const PREVIEW_LENGTH = 180;

export function ReviewsPage() {
  const queryClient = useQueryClient();
  const [rejectNote, setRejectNote] = useState<Record<string, string>>({});
  const [rejectOpen, setRejectOpen] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["pois", "", "in_review"],
    queryFn: () => sendJson<Schemas["PoiOut"][]>("/api/v1/pois?status=in_review"),
    retry: false,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => sendJson(`/api/v1/pois/${id}/approve`, "POST"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pois"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      sendJson(`/api/v1/pois/${id}/reject`, "POST", { review_note: note }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["pois"] });
      setRejectOpen((prev) => ({ ...prev, [id]: false }));
      setRejectNote((prev) => ({ ...prev, [id]: "" }));
    },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Duyệt script</h1>
        {data && <p className="text-slate-500 text-sm mt-1">{data.length} script đang chờ duyệt</p>}
      </div>

      {(approveMutation.error ?? rejectMutation.error) && (
        <p role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {(approveMutation.error ?? rejectMutation.error)?.message}
        </p>
      )}

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
        <div className="text-center py-20 bg-white border-2 border-dashed border-slate-200 rounded-xl">
          <CheckCheck size={36} className="mx-auto mb-3 text-teal-600" aria-hidden />
          <p className="text-slate-700 font-semibold">Không có script nào chờ duyệt!</p>
          <p className="text-slate-400 text-sm mt-1">Mọi thứ đã được xử lý.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data?.map((a) => {
            const script = a.script ?? "";
            const characters = Array.from(script);
            const hasPreview = characters.length > PREVIEW_LENGTH;
            const isExpanded = Boolean(expanded[a.id]);
            const scriptId = `review-script-${a.id}`;
            const displayScript = hasPreview && !isExpanded
              ? `${characters.slice(0, PREVIEW_LENGTH).join("").trimEnd()}…`
              : script;
            return (
              <div key={a.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-lg">
                      <Hourglass size={18} className="text-amber-600" aria-hidden />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800">{a.name}</h3>
                      <div className="flex gap-3 text-xs text-slate-400 mt-0.5">
                        <span className="inline-flex items-center gap-1"><Tag size={12} aria-hidden /> {a.category}</span>
                        <span className="inline-flex items-center gap-1"><FileText size={12} aria-hidden /> v{a.script_version}</span>
                        <span>{characters.length} ký tự</span>
                      </div>
                    </div>
                  </div>
                  {hasPreview && (
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-controls={scriptId}
                      onClick={() => setExpanded((prev) => ({ ...prev, [a.id]: !prev[a.id] }))}
                      className="inline-flex shrink-0 items-center gap-1.5 text-xs px-3 py-1.5 border border-slate-200 text-slate-500 hover:text-teal-700 hover:border-teal-300 rounded-lg transition-colors"
                    >
                      {isExpanded ? <EyeOff size={13} aria-hidden /> : <Eye size={13} aria-hidden />}
                      {isExpanded ? "Thu gọn" : "Xem đầy đủ"}
                    </button>
                  )}
                </div>

                {/* Script */}
                <div className="px-6 py-4">
                  <p id={scriptId} className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap wrap-break-word border-l-2 border-teal-400 pl-4 bg-teal-50/50 py-2 rounded-r-lg">
                    {displayScript || <span className="text-slate-400 italic">Chưa có nội dung</span>}
                  </p>
                </div>

                {/* Actions */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3 items-start">
                  <button
                    onClick={() => approveMutation.mutate(a.id)}
                    disabled={approveMutation.isPending}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm"
                  >
                    <Check size={15} aria-hidden /> Duyệt
                  </button>
                  <button
                    onClick={() => setRejectOpen((prev) => ({ ...prev, [a.id]: !prev[a.id] }))}
                    className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      rejectOpen[a.id]
                        ? "bg-red-100 text-red-700 border border-red-200"
                        : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                    }`}
                  >
                    <Undo2 size={15} aria-hidden /> Trả lại
                  </button>

                  {rejectOpen[a.id] && (
                    <div className="flex-1 flex gap-2">
                      <input
                        value={rejectNote[a.id] ?? ""}
                        onChange={(e) => setRejectNote((prev) => ({ ...prev, [a.id]: e.target.value }))}
                        placeholder="Lý do trả lại..."
                        className="flex-1 bg-white border border-slate-200 text-slate-700 text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-slate-400"
                      />
                      <button
                        onClick={() => rejectMutation.mutate({ id: a.id, note: rejectNote[a.id] ?? "" })}
                        disabled={!rejectNote[a.id] || rejectMutation.isPending}
                        className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                      >
                        Xác nhận
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
