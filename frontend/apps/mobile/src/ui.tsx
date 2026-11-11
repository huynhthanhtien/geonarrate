import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type RefreshControlProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { initials } from "./format";
import {
  colors,
  coverFor,
  fonts,
  layout,
  radius,
  shadow,
  space,
  type as typography,
} from "./theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];
export type TextVariant = keyof typeof typography;

/* ------------------------------------------------------------------ */
/* Chữ                                                                 */
/* ------------------------------------------------------------------ */

export function Txt({ children, variant = "body", color = colors.text, style, numberOfLines, center, accessibilityRole }: {
  children?: ReactNode;
  variant?: TextVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  center?: boolean;
  accessibilityRole?: ComponentProps<typeof Text>["accessibilityRole"];
}) {
  return (
    <Text
      style={[typography[variant], { color }, center && { textAlign: "center" }, style]}
      numberOfLines={numberOfLines}
      accessibilityRole={accessibilityRole}
    >
      {children}
    </Text>
  );
}

/* ------------------------------------------------------------------ */
/* Khung màn hình                                                      */
/* ------------------------------------------------------------------ */

export function Screen({ children, scroll = true, background = colors.canvas, contentStyle, footer, refreshControl, padBottom = 32 }: {
  children: ReactNode;
  scroll?: boolean;
  background?: string;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  padBottom?: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: background, paddingTop: insets.top }}>
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[{ padding: layout.gutter, paddingBottom: padBottom, gap: space.lg }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      )}
      {footer ? (
        <View style={{
          paddingHorizontal: layout.gutter,
          paddingTop: space.sm,
          paddingBottom: insets.bottom + space.md,
          backgroundColor: background,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        }}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

export function Header({ title, subtitle, onBack, right, backLabel }: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  backLabel?: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      {onBack ? <IconButton name="chevron-back" onPress={onBack} accessibilityLabel={backLabel} variant="surface" /> : null}
      <View style={{ flex: 1 }}>
        <Txt variant="title" numberOfLines={1}>{title}</Txt>
        {subtitle ? <Txt variant="small" color={colors.textMuted} numberOfLines={1}>{subtitle}</Txt> : null}
      </View>
      {right}
    </View>
  );
}

export function SectionHeader({ title, action, onAction }: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.xs }}>
      <Txt variant="section" style={{ flex: 1 }}>{title}</Txt>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
          <Txt variant="label" color={colors.primary}>{action}</Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Nút                                                                 */
/* ------------------------------------------------------------------ */

type ButtonKind = "primary" | "secondary" | "ghost" | "danger" | "inverse";

export function Button({ label, onPress, kind = "primary", icon, loading, disabled, style, size = "md" }: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: "md" | "sm";
}) {
  const fg = kind === "primary" ? colors.primaryFg
    : kind === "danger" ? colors.danger
      : kind === "inverse" ? colors.primary
        : kind === "secondary" ? colors.primaryDark
          : colors.text;
  const bg = kind === "primary" ? colors.primary
    : kind === "danger" ? colors.dangerSoft
      : kind === "inverse" ? colors.white
        : kind === "secondary" ? colors.primarySoft
          : "transparent";
  const border = kind === "ghost" ? colors.border : "transparent";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled || loading) }}
      disabled={disabled || loading}
      onPress={() => {
        if (kind === "primary" || kind === "inverse") {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        }
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: 1,
          height: size === "sm" ? 40 : layout.buttonHeight,
          paddingHorizontal: size === "sm" ? space.md : space.lg,
        },
        pressed && { opacity: 0.86, transform: [{ scale: 0.99 }] },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : (
        <>
          {icon ? <Ionicons name={icon} size={size === "sm" ? 17 : 19} color={fg} /> : null}
          <Text style={[typography.bodyStrong, { color: fg, fontSize: size === "sm" ? 14 : 16 }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

type IconButtonVariant = "surface" | "plain" | "soft" | "dark" | "primary";

export function IconButton({ name, onPress, accessibilityLabel, variant = "plain", size = 40, iconSize = 21, color, disabled, style }: {
  name: IconName;
  onPress: () => void;
  accessibilityLabel?: string;
  variant?: IconButtonVariant;
  size?: number;
  iconSize?: number;
  color?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = variant === "surface" ? colors.surface
    : variant === "soft" ? colors.primarySoft
      : variant === "dark" ? "rgba(255,255,255,0.14)"
        : variant === "primary" ? colors.primary
          : "transparent";
  const fg = color ?? (variant === "primary" ? colors.primaryFg
    : variant === "soft" ? colors.primary
      : variant === "dark" ? colors.white
        : colors.text);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      hitSlop={6}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: bg,
        },
        variant === "surface" && shadow.card,
        pressed && { opacity: 0.7 },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      <Ionicons name={name} size={iconSize} color={fg} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Thẻ, nhãn                                                          */
/* ------------------------------------------------------------------ */

export function Card({ children, onPress, style, tone }: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  tone?: "surface" | "muted" | "primary" | "accent";
}) {
  const bg = tone === "muted" ? colors.surfaceMuted
    : tone === "primary" ? colors.primarySoft
      : tone === "accent" ? colors.accentSoft
        : colors.surface;
  const base: StyleProp<ViewStyle> = [styles.card, { backgroundColor: bg }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [base, pressed && { opacity: 0.9, transform: [{ scale: 0.995 }] }]}
    >
      {children}
    </Pressable>
  );
}

type ChipTone = "neutral" | "primary" | "accent" | "success" | "warning" | "danger" | "info" | "dark" | "light";

const CHIP: Record<ChipTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.surfaceMuted, fg: colors.textMuted },
  primary: { bg: colors.primarySoft, fg: colors.primaryDark },
  accent: { bg: colors.accentSoft, fg: colors.accent },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  info: { bg: colors.infoSoft, fg: colors.info },
  dark: { bg: colors.text, fg: colors.white },
  light: { bg: "rgba(255,255,255,0.2)", fg: colors.white },
};

export function Chip({ label, tone = "neutral", icon, onPress, selected, style }: {
  label: string;
  tone?: ChipTone;
  icon?: IconName;
  onPress?: () => void;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = selected ? { bg: colors.primary, fg: colors.primaryFg } : CHIP[tone];
  const content = (
    <>
      {icon ? <Ionicons name={icon} size={12} color={palette.fg} /> : null}
      <Text style={[typography.caption, { color: palette.fg }]} numberOfLines={1}>{label}</Text>
    </>
  );
  const base: StyleProp<ViewStyle> = [styles.chip, { backgroundColor: palette.bg }, style];
  if (!onPress) return <View style={base}>{content}</View>;
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      style={({ pressed }) => [base, pressed && { opacity: 0.75 }]}
    >
      {content}
    </Pressable>
  );
}

export function ProgressBar({ value, color = colors.primary, track = colors.border, height = 6, style }: {
  value: number;
  color?: string;
  track?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View style={[{ height, borderRadius: height / 2, backgroundColor: track, overflow: "hidden" }, style]}>
      <View style={{ width: `${pct * 100}%`, height: "100%", borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Bìa sinh tự động                                                    */
/* ------------------------------------------------------------------ */

export function Cover({ seed, name, height = 72, width, style, rounded = radius.md, showInitials = true, children }: {
  seed: string;
  name: string;
  height?: number;
  width?: number;
  style?: StyleProp<ViewStyle>;
  rounded?: number;
  showInitials?: boolean;
  children?: ReactNode;
}) {
  const [from, to] = coverFor(seed);
  return (
    <LinearGradient
      colors={[from, to]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ height, width, borderRadius: rounded, overflow: "hidden", alignItems: "center", justifyContent: "center" }, style]}
    >
      <View style={{
        position: "absolute", top: -height * 0.35, right: -height * 0.18,
        width: height * 0.95, height: height * 0.95, borderRadius: height,
        borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
      }} />
      <View style={{
        position: "absolute", bottom: -height * 0.45, left: -height * 0.2,
        width: height * 1.1, height: height * 1.1, borderRadius: height,
        backgroundColor: "rgba(255,255,255,0.08)",
      }} />
      {showInitials && height >= 40 ? (
        <Text style={{
          fontFamily: fonts.bold,
          fontSize: Math.max(15, Math.min(height * 0.3, 72)),
          color: "rgba(255,255,255,0.9)",
          letterSpacing: 1,
        }}>
          {initials(name)}
        </Text>
      ) : null}
      <View style={{ position: "absolute", left: space.sm, bottom: space.sm, flexDirection: "row", alignItems: "flex-end", gap: 2 }}>
        {[6, 11, 8, 14].map((bar, index) => (
          <View key={index} style={{ width: 2.5, height: bar, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.55)" }} />
        ))}
      </View>
      {children}
    </LinearGradient>
  );
}

/* ------------------------------------------------------------------ */
/* Dòng cài đặt, ô nhập, trạng thái rỗng                               */
/* ------------------------------------------------------------------ */

export function Row({ icon, title, subtitle, value, onPress, right, danger }: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  right?: ReactNode;
  danger?: boolean;
}) {
  const body = (
    <>
      {icon ? (
        <View style={[styles.rowIcon, danger && { backgroundColor: colors.dangerSoft }]}>
          <Ionicons name={icon} size={19} color={danger ? colors.danger : colors.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong" color={danger ? colors.danger : colors.text} numberOfLines={1}>{title}</Txt>
        {subtitle ? <Txt variant="caption" color={colors.textMuted} numberOfLines={2}>{subtitle}</Txt> : null}
      </View>
      {value ? <Txt variant="small" color={colors.textMuted} numberOfLines={1} style={{ maxWidth: "45%" }}>{value}</Txt> : null}
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={17} color={colors.tabInactive} /> : null)}
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceMuted }]}
    >
      {body}
    </Pressable>
  );
}

export function TextField({ label, containerStyle, style, ...props }: TextInputProps & {
  label?: string;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ gap: space.xs }, containerStyle]}>
      {label ? <Txt variant="label" color={colors.textMuted}>{label}</Txt> : null}
      <TextInput
        placeholderTextColor={colors.tabInactive}
        {...props}
        style={[styles.input, style]}
      />
    </View>
  );
}

export function EmptyState({ icon = "compass-outline", title, body, actionLabel, onAction }: {
  icon?: IconName;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ alignItems: "center", paddingVertical: space.xxl, paddingHorizontal: space.lg, gap: space.sm }}>
      <View style={{
        width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primarySoft,
        alignItems: "center", justifyContent: "center", marginBottom: space.xs,
      }}>
        <Ionicons name={icon} size={30} color={colors.primary} />
      </View>
      <Txt variant="section" center>{title}</Txt>
      {body ? <Txt variant="small" color={colors.textMuted} center style={{ maxWidth: 300 }}>{body}</Txt> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} kind="secondary" size="sm" style={{ marginTop: space.sm }} />
      ) : null}
    </View>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <View style={{ alignItems: "center", gap: space.sm, paddingVertical: space.xl }}>
      <ActivityIndicator color={colors.primary} />
      {label ? <Txt variant="small" color={colors.textMuted}>{label}</Txt> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Bottom sheet                                                        */
/* ------------------------------------------------------------------ */

export function Sheet({ visible, onClose, title, children, closeLabel }: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  closeLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
        <View style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          padding: layout.gutter,
          paddingBottom: insets.bottom + layout.gutter,
          gap: space.md,
        }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center" }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Txt variant="section" style={{ flex: 1 }}>{title}</Txt>
            <IconButton name="close" onPress={onClose} accessibilityLabel={closeLabel} variant="soft" size={34} iconSize={18} />
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    borderRadius: radius.lg,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.sm,
    ...shadow.card,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
});
