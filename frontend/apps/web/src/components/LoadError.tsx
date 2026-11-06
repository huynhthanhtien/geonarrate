export function LoadError({ error }: { error: unknown }) {
  const detail = error instanceof Error ? error.message : "Không tải được dữ liệu";
  return (
    <div role="alert" className="text-center py-20 border-2 border-dashed border-red-200 rounded-xl">
      <p className="text-slate-700 font-semibold">Không tải được dữ liệu</p>
      <p className="text-slate-400 text-sm mt-1">{detail}</p>
    </div>
  );
}
