import { Compass } from "lucide-react";
import { Link } from "react-router";
import { primaryBtn } from "../components/ui";

export function NotFoundPage() {
  return (
    <section className="mx-auto mt-16 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
      <Compass size={32} className="mx-auto text-teal-600" aria-hidden />
      <h1 className="mt-4 text-lg font-semibold text-slate-800">Không tìm thấy trang</h1>
      <p className="mt-1 text-sm text-slate-500">Đường dẫn không tồn tại hoặc đã đổi. Hãy chọn mục ở thanh bên trái.</p>
      <Link to="/" className={`${primaryBtn} mt-5`}>Về trang tổng quan</Link>
    </section>
  );
}
