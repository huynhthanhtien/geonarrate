import { useQuery } from "@tanstack/react-query";
import { color, space } from "@geonarrate/tokens";
import { api } from "../api";

export function AuditPage() {
  const logs = useQuery({
    queryKey: ["audit"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/v1/audit", { params: { query: { limit: 100 } } });
      if (error) throw new Error("Không tải được nhật ký");
      return data;
    },
  });
  const cell = { padding: `${space.xs}px ${space.sm}px`, borderBottom: `1px solid ${color.surfaceMuted}` };

  return (
    <section>
      <h1>Nhật ký thao tác</h1>
      {logs.isError && <p style={{ color: color.danger }}>{logs.error.message}</p>}
      {logs.data?.length === 0 && <p style={{ color: color.textMuted }}>Chưa có thao tác nào.</p>}
      {!!logs.data?.length && (
        <table style={{ borderCollapse: "collapse", width: "100%", textAlign: "left" }}>
          <thead>
            <tr>
              {["Thời điểm", "Người thực hiện", "Hành động", "Đối tượng", "Ghi chú"].map((h) => (
                <th key={h} style={cell}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.data.map((log) => (
              <tr key={log.id}>
                <td style={cell}>{new Date(log.ts).toLocaleString("vi-VN")}</td>
                <td style={cell}>{log.actor_id}</td>
                <td style={cell}>{log.action}</td>
                <td style={cell}>
                  {log.resource.type}/{log.resource.id}
                </td>
                <td style={cell}>{log.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
