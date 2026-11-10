import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schemas } from "@geonarrate/api-client";
import { AlertTriangle, CheckCircle2, ChevronRight, Hammer, History, Loader2, Send, XCircle } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { sendJson } from "../api";
import { Badge, Dialog, Empty, ErrorBox, Field, ghostBtn, inputClass, Page, primaryBtn, Table } from "../components/ui";
import { formatDateTime } from "../labels";
import { useLanguages } from "../languages";
import { Select } from "../components/Select";
import { useCan } from "../auth/session";

type Pack = Schemas["PackOut"];
type LangStatus = Schemas["PackStatusOut"];
type Diff = Schemas["PackDiffOut"];

const STATUS = {
  building: { label: "Đang build", tone: "blue" },
  qa: { label: "Chờ phát hành", tone: "amber" },
  published: { label: "Đang phát hành", tone: "green" },
  superseded: { label: "Bản cũ", tone: "gray" },
  failed: { label: "Lỗi", tone: "red" },
} as const;

const mb = (bytes?: number | null) => (bytes == null ? "-" : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
const when = formatDateTime;
const signedKb = (bytes: number) => `${bytes >= 0 ? "+" : "−"}${(Math.abs(bytes) / 1024).toFixed(0)} KB`;

function DiffSummary({ diff }: { diff: Diff }) {
  const parts = [
    diff.added.length && `+${diff.added.length} điểm`,
    diff.removed.length && `−${diff.removed.length} điểm`,
    diff.changed.length && `~${diff.changed.length} điểm đổi`,
  ].filter(Boolean);
  return (
    <span>
      {diff.against_version == null ? "Bản đầu tiên" : `So với v${diff.against_version}: ${parts.join(", ") || "không đổi điểm"}`}
      {" · "}{signedKb(diff.bytes_delta)}
    </span>
  );
}

function DiffDetail({ diff }: { diff: Diff }) {
  const rows: [string, string[]][] = [
    ["Thêm", diff.added],
    ["Bỏ", diff.removed],
    ["Đổi", diff.changed.map((c) => `${c.name} (${c.what.join(", ")})`)],
  ];
  return (
    <dl className="space-y-1.5">
      {rows.filter(([, items]) => items.length).map(([label, items]) => (
        <div key={label} className="flex gap-2">
          <dt className="w-10 shrink-0 font-medium text-slate-700">{label}</dt>
          <dd>{items.join(", ")}</dd>
        </div>
      ))}
      <div className="flex gap-2">
        <dt className="w-10 shrink-0 font-medium text-slate-700">Dung lượng</dt>
        <dd>{signedKb(diff.bytes_delta)}</dd>
      </div>
    </dl>
  );
}

function LangCard({ status, name, onBuild, building, canBuild, onPublish, onRollback }: {
  status: LangStatus;
  name: string;
  onBuild: () => void;
  building: boolean;
  canBuild: boolean;
  onPublish: (pack: Pack) => void;
  onRollback: (pack: Pack) => void;
}) {
  const navigate = useNavigate();
  const { published, pending } = status;
  const diff = useQuery({
    queryKey: ["pack-diff", pending?.id],
    queryFn: () => sendJson<Diff>(`/api/v1/packs/${pending!.id}/diff`),
    enabled: !!pending,
    retry: false,
  });
  const latestFailed = status.history.find((p) => p.status === "failed" && p.version > (published?.version ?? 0) && p.version > (pending?.version ?? 0));
  return (
    <section className="flex flex-col rounded-xl border border-slate-200 bg-white" aria-label={`Pack ${name}`}>
      <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h2 className="font-semibold text-slate-800">{name} <span className="text-xs font-normal text-slate-400">({status.lang})</span></h2>
        <span className="text-xs text-slate-500">{status.ready_pois}/{status.total_pois} điểm có audio</span>
      </header>
      <div className="flex-1 space-y-4 px-5 py-4 text-sm">
        <div>
          {published ? (
            <>
              <p className="flex items-center gap-2"><Badge tone="green">Đang phát hành</Badge><strong className="text-slate-800">v{published.version}</strong></p>
              <p className="mt-1 text-xs text-slate-500">
                {when(published.published_at)}{published.published_by_email ? ` · ${published.published_by_email}` : ""} · {published.file_count} điểm · {mb(published.total_bytes)}
              </p>
            </>
          ) : <p className="text-slate-500">Chưa phát hành bản nào — app chưa tải được ngôn ngữ này.</p>}
        </div>

        {status.building && (
          <p className="flex items-center gap-2 text-sky-700" role="status"><Loader2 size={15} className="animate-spin" aria-hidden /> Đang build v{status.building.version}…</p>
        )}

        {pending && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            <p className="flex items-center gap-2"><Badge tone="amber">Chờ phát hành</Badge><strong className="text-slate-800">v{pending.version}</strong></p>
            <p className="mt-1 text-xs text-slate-600">{diff.data ? <DiffSummary diff={diff.data} /> : "Đang so sánh…"}</p>
            <button className={`${primaryBtn} mt-3`} onClick={() => onPublish(pending)}><Send size={14} aria-hidden /> Phát hành v{pending.version}</button>
          </div>
        )}

        {latestFailed && (
          <p className="flex items-start gap-2 text-red-700"><XCircle size={15} className="mt-0.5 shrink-0" aria-hidden /> Build v{latestFailed.version} lỗi, hãy build lại.</p>
        )}

        <div className="flex items-start gap-2">
          {status.can_build ? (
            <><Hammer size={15} className="mt-0.5 shrink-0 text-teal-700" aria-hidden /><span className="text-slate-700">{published || pending ? "Nội dung đã đổi, sẵn sàng build bản mới" : "Đủ audio, sẵn sàng build bản đầu tiên"}</span></>
          ) : status.blocker === "pack_unchanged" ? (
            <><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-green-700" aria-hidden /><span className="text-slate-700">
              {status.same_version === published?.version ? "App đang có nội dung mới nhất" : `Nội dung mới nhất đã có ở v${status.same_version}`}
            </span></>
          ) : status.blocker === "pack_building" ? null : (
            <><AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" aria-hidden /><span className="text-slate-700">{status.reason}</span></>
          )}
        </div>
        {status.missing.length > 0 && (
          <div className="text-xs text-slate-600">
            Chưa có audio: {status.missing.slice(0, 3).join(", ")}{status.missing.length > 3 ? ` và ${status.missing.length - 3} điểm khác` : ""}
            <button type="button" className="ml-2 inline-flex items-center font-medium text-teal-700 hover:underline" onClick={() => navigate("/studio/voice")}>
              Mở Voice Studio <ChevronRight size={13} aria-hidden />
            </button>
          </div>
        )}
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500 hover:text-slate-700">Lịch sử ({status.history.length})</summary>
          <ul className="mt-2 space-y-2">
            {status.history.length === 0 && <li className="text-xs text-slate-400">Chưa có bản cũ.</li>}
            {status.history.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-xs">
                <strong className="text-slate-700">v{p.version}</strong>
                <Badge tone={STATUS[p.status as keyof typeof STATUS]?.tone ?? "gray"}>{STATUS[p.status as keyof typeof STATUS]?.label ?? p.status}</Badge>
                <span className="text-slate-500">{when(p.published_at ?? p.created_at)}</span>
                {p.status === "superseded" && (
                  <button className="ml-auto inline-flex items-center gap-1 font-medium text-teal-700 hover:underline" onClick={() => onRollback(p)}>
                    <History size={12} aria-hidden /> Quay về
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
        {canBuild && (
          <button className={ghostBtn} disabled={!status.can_build || building} title={status.reason ?? undefined} onClick={onBuild}>
            <Hammer size={14} aria-hidden /> Build
          </button>
        )}
      </footer>
    </section>
  );
}

export function PacksPage() {
  const qc = useQueryClient();
  // Build cần quyền audio:build; phát hành và rollback cần pack:publish
  const canBuild = useCan()("audio:build");
  const languages = useLanguages();
  const tours = useQuery({ queryKey: ["tours"], queryFn: () => sendJson<any[]>("/api/v1/tours"), retry: false });
  const [tourId, setTourId] = useState("");
  const current = tourId || tours.data?.[0]?.id || "";
  const status = useQuery({
    queryKey: ["pack-status", current],
    queryFn: () => sendJson<LangStatus[]>(`/api/v1/packs/status?tour_id=${encodeURIComponent(current)}`),
    enabled: !!current,
    retry: false,
    refetchInterval: (q) => (q.state.data?.some((s) => s.building) ? 3000 : false),
  });
  const allPacks = useQuery({ queryKey: ["packs"], queryFn: () => sendJson<Pack[]>("/api/v1/packs"), retry: false });
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ["pack-status"] }),
    qc.invalidateQueries({ queryKey: ["packs"] }),
    qc.invalidateQueries({ queryKey: ["pack-diff"] }),
  ]);
  const [buildErrors, setBuildErrors] = useState<string[]>([]);
  const build = useMutation({
    mutationFn: async (langs: string[]) => {
      const results = await Promise.allSettled(langs.map((lang) => sendJson("/api/v1/packs/build", "POST", { tour_id: current, lang })));
      return results.flatMap((r, i) => (r.status === "rejected" ? [`${langs[i]}: ${r.reason instanceof Error ? r.reason.message : "Không thể build"}`] : []));
    },
    onMutate: () => setBuildErrors([]),
    onSuccess: (errors) => { setBuildErrors(errors); return refresh(); },
  });
  const [publishing, setPublishing] = useState<Pack | null>(null);
  const publishDiff = useQuery({
    queryKey: ["pack-diff", publishing?.id],
    queryFn: () => sendJson<Diff>(`/api/v1/packs/${publishing!.id}/diff`),
    enabled: !!publishing,
    retry: false,
  });
  const publish = useMutation({
    mutationFn: (id: string) => sendJson(`/api/v1/packs/${id}/publish`, "POST"),
    onSuccess: () => { setPublishing(null); return refresh(); },
  });
  const [rollingBack, setRollingBack] = useState<Pack | null>(null);
  const [reason, setReason] = useState("");
  const rollback = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => sendJson(`/api/v1/packs/${id}/rollback`, "POST", { reason }),
    onSuccess: () => { setRollingBack(null); setReason(""); return refresh(); },
  });
  const langName = (code: string) => languages.data?.find((l) => l.code === code)?.native_name ?? code;
  const tourName = (id: string) => tours.data?.find((t) => t.id === id)?.name ?? id;
  const ready = (status.data ?? []).filter((s) => s.can_build).map((s) => s.lang);

  return (
    <Page
      title="Pack"
      subtitle="Mỗi ngôn ngữ của tour: bản app đang tải, bản chờ phát hành và việc cần làm tiếp"
      action={canBuild &&
        <button className={primaryBtn} disabled={!ready.length || build.isPending} onClick={() => build.mutate(ready)}>
          <Hammer size={15} aria-hidden /> {build.isPending ? "Đang tạo…" : `Build các ngôn ngữ sẵn sàng (${ready.length})`}
        </button>
      }
    >
      <div className="mb-5 max-w-sm">
        <Field label="Tour">
          <Select ariaLabel="Tour" value={current} onChange={setTourId}
            options={(tours.data ?? []).map((t) => ({ value: t.id, label: t.name, hint: t.status === "published" ? undefined : "nháp" }))} />
        </Field>
      </div>
      {tours.data?.find((t) => t.id === current)?.status === "draft" && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="note">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          Tour này đang là nháp: app chưa hiển thị tour, kể cả các pack đã phát hành. Đổi sang “Hiện trên app” ở trang Tour khi sẵn sàng.
        </div>
      )}
      <ErrorBox error={languages.error ?? tours.error ?? status.error ?? build.error ?? rollback.error} />
      {!!buildErrors.length && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {buildErrors.map((e) => <p key={e}>{e}</p>)}
        </div>
      )}
      {tours.data?.length === 0 && <Empty>Chưa có tour nào. Tạo tour trước khi build pack.</Empty>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {status.data?.map((s) => (
          <LangCard key={s.lang} status={s} name={langName(s.lang)} building={build.isPending} canBuild={canBuild}
            onBuild={() => build.mutate([s.lang])} onPublish={setPublishing} onRollback={setRollingBack} />
        ))}
      </div>

      <details className="mt-8">
        <summary className="cursor-pointer text-sm font-medium text-slate-600 hover:text-slate-800">Tất cả pack ({allPacks.data?.length ?? 0})</summary>
        <div className="mt-3">
          <Table head={["Tour", "Ngôn ngữ", "Version", "Trạng thái", "File", "Dung lượng", "Phát hành"]}>
            {allPacks.data?.map((p) => {
              const s = STATUS[p.status as keyof typeof STATUS];
              return (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 font-medium">{tourName(p.tour_id)}</td>
                  <td className="px-4 py-2.5">{p.lang}</td>
                  <td className="px-4 py-2.5">v{p.version}</td>
                  <td className="px-4 py-2.5"><Badge tone={s?.tone ?? "gray"}>{s?.label ?? p.status}</Badge></td>
                  <td className="px-4 py-2.5">{p.file_count ?? "-"}</td>
                  <td className="px-4 py-2.5">{mb(p.total_bytes)}</td>
                  <td className="px-4 py-2.5 text-slate-500">{when(p.published_at)}</td>
                </tr>
              );
            })}
          </Table>
        </div>
      </details>

      <Dialog open={!!publishing} title={`Phát hành ${publishing ? `${langName(publishing.lang)} v${publishing.version}` : ""}`} onClose={() => setPublishing(null)}>
        <p className="mb-3">App sẽ nhận bản này ở lần kiểm tra cập nhật tiếp theo. Bản đang phát hành chuyển thành bản cũ và vẫn rollback được.</p>
        {publishDiff.data ? <DiffDetail diff={publishDiff.data} /> : <p>Đang so sánh…</p>}
        <ErrorBox error={publish.error} />
        <div className="mt-5 flex justify-end gap-2">
          <button className={ghostBtn} onClick={() => setPublishing(null)}>Huỷ</button>
          <button className={primaryBtn} disabled={publish.isPending} onClick={() => publishing && publish.mutate(publishing.id)}>
            <Send size={14} aria-hidden /> {publish.isPending ? "Đang phát hành…" : "Phát hành"}
          </button>
        </div>
      </Dialog>

      <Dialog open={!!rollingBack} title={`Quay về ${rollingBack ? `${langName(rollingBack.lang)} v${rollingBack.version}` : ""}`} onClose={() => setRollingBack(null)}>
        <p className="mb-3">Bản này sẽ thành bản đang phát hành; bản hiện tại chuyển thành bản cũ.</p>
        <label className="block">
          <span className="mb-1 block font-medium text-slate-700">Lý do (ghi vào nhật ký)</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={inputClass} placeholder="Ví dụ: audio điểm X bị lỗi phát âm" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button className={ghostBtn} onClick={() => setRollingBack(null)}>Huỷ</button>
          <button className={primaryBtn} disabled={!reason.trim() || rollback.isPending}
            onClick={() => rollingBack && rollback.mutate({ id: rollingBack.id, reason: reason.trim() })}>
            <History size={14} aria-hidden /> Quay về v{rollingBack?.version}
          </button>
        </div>
      </Dialog>
    </Page>
  );
}
