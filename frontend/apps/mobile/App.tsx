import { GEOFENCE_RADIUS_DEFAULT_M, SUPPORTED_LANGS } from "@geonarrate/core";
import { color, font, space } from "@geonarrate/tokens";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎧 Thuyết Minh Đa Ngôn Ngữ</Text>
      <Text style={styles.muted}>Ngôn ngữ: {SUPPORTED_LANGS.join(" · ")}</Text>
      <Text style={styles.muted}>Bán kính geofence mặc định: {GEOFENCE_RADIUS_DEFAULT_M} m</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.surface, alignItems: "center", justifyContent: "center", gap: space.sm },
  title: { fontSize: font.title, fontWeight: "600", color: color.primary },
  muted: { fontSize: font.body, color: color.textMuted },
});
