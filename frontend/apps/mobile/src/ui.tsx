import { color, font, radius, space } from "@geonarrate/tokens";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export function Screen({ title, onBack, children }: { title: string; onBack?: () => void; children: ReactNode }) {
  return (
    <View style={s.screen}>
      <View style={s.header}>
        {onBack && (
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Quay lại" hitSlop={12}>
            <Text style={s.back}>‹</Text>
          </Pressable>
        )}
        <Text style={s.title} numberOfLines={1}>{title}</Text>
      </View>
      <ScrollView contentContainerStyle={s.body}>{children}</ScrollView>
    </View>
  );
}

export function Btn({ label, onPress, kind = "primary", disabled }: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "ghost" | "danger";
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[s.btn, kind === "primary" && s.btnPrimary, kind === "ghost" && s.btnGhost, kind === "danger" && s.btnDanger, disabled && { opacity: 0.5 }]}
    >
      <Text style={[s.btnText, kind === "primary" && { color: color.primaryFg }, kind === "danger" && { color: color.danger }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  return <Pressable onPress={onPress} disabled={!onPress} style={s.card}>{children}</Pressable>;
}

export const T = {
  h: ({ children }: { children: ReactNode }) => <Text style={s.h}>{children}</Text>,
  p: ({ children }: { children: ReactNode }) => <Text style={s.p}>{children}</Text>,
  muted: ({ children }: { children: ReactNode }) => <Text style={s.muted}>{children}</Text>,
  error: ({ children }: { children: ReactNode }) => <Text accessibilityRole="alert" style={s.error}>{children}</Text>,
};

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface, paddingTop: 48 },
  header: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: color.surfaceMuted },
  back: { fontSize: 30, lineHeight: 30, color: color.primary, paddingRight: space.xs },
  title: { flex: 1, fontSize: font.title, fontWeight: "700", color: color.text },
  body: { padding: space.lg, gap: space.md },
  btn: { paddingVertical: space.md, paddingHorizontal: space.lg, borderRadius: radius.md, alignItems: "center" },
  btnPrimary: { backgroundColor: color.primary },
  btnGhost: { backgroundColor: color.surfaceMuted },
  btnDanger: { backgroundColor: "#FEF2F2" },
  btnText: { fontSize: font.body, fontWeight: "600", color: color.text },
  card: { padding: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: color.surfaceMuted, gap: space.xs },
  h: { fontSize: font.body + 1, fontWeight: "700", color: color.text },
  p: { fontSize: font.body, color: color.text, lineHeight: 22 },
  muted: { fontSize: font.body - 2, color: color.textMuted },
  error: { fontSize: font.body - 1, color: color.danger },
});
