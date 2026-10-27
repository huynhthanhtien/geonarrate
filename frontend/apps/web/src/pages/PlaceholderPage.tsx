import { color } from "@geonarrate/tokens";

/** Khung cho các mục làm ở story sau — route và quyền đã có. */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <p style={{ color: color.textMuted }}>Chưa làm.</p>
    </section>
  );
}
