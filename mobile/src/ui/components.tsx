import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { splitForDisplay } from "../core/antiPhishing";
import { colors, radius, spacing } from "./theme";

export function Card({
  title,
  subtitle,
  children,
  variant = "default",
  style,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  variant?: "default" | "hero" | "warning";
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.card,
        variant === "hero" && styles.cardHero,
        variant === "warning" && styles.cardWarning,
        style,
      ]}
    >
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

export function Btn({
  label,
  onPress,
  kind = "default",
  disabled,
  busy,
  compact,
}: {
  label: string;
  onPress: () => void;
  kind?: "default" | "primary" | "danger" | "ghost";
  disabled?: boolean;
  busy?: boolean;
  compact?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.76}
      accessibilityRole="button"
      style={[
        styles.btn,
        compact && styles.btnCompact,
        kind === "primary" && styles.btnPrimary,
        kind === "danger" && styles.btnDanger,
        kind === "ghost" && styles.btnGhost,
        (disabled || busy) && styles.btnDisabled,
      ]}
      onPress={onPress}
      disabled={disabled || busy}
    >
      {busy ? (
        <ActivityIndicator color={kind === "primary" ? colors.black : colors.text} />
      ) : (
        <Text
          style={[
            styles.btnText,
            kind === "primary" && styles.btnTextPrimary,
            kind === "danger" && styles.btnTextDanger,
            kind === "ghost" && styles.btnTextGhost,
          ]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export function Input(props: TextInputProps & { label?: string; hint?: string }) {
  return (
    <View style={styles.inputWrap}>
      {props.label ? <Text style={styles.inputLabel}>{props.label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        {...props}
        style={[styles.input, props.multiline && styles.inputMultiline, props.style]}
      />
      {props.hint ? <Text style={styles.inputHint}>{props.hint}</Text> : null}
    </View>
  );
}

export function Badge({ label, tone = "neutral" }: { label: string; tone?: "accent" | "neutral" | "green" | "red" }) {
  return (
    <View
      style={[
        styles.badge,
        tone === "accent" && styles.badgeAccent,
        tone === "green" && styles.badgeGreen,
        tone === "red" && styles.badgeRed,
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          tone === "accent" && styles.badgeTextAccent,
          tone === "green" && styles.badgeTextGreen,
          tone === "red" && styles.badgeTextRed,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? <Text style={styles.sectionAction}>{action}</Text> : null}
    </View>
  );
}

export function InfoRow({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" | "accent" }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text
        style={[
          styles.infoValue,
          tone === "green" && { color: colors.green },
          tone === "red" && { color: colors.red },
          tone === "accent" && { color: colors.accent },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

/** Adres zehirleme saldırılarına karşı ilk ve son karakterleri belirgin gösterir. */
export function AddressText({ address, large = false }: { address: string; large?: boolean }) {
  const { head, middle, tail } = splitForDisplay(address);
  return (
    <Text selectable style={[styles.addr, large && styles.addrLarge]}>
      <Text style={styles.addrStrong}>{head}</Text>
      <Text style={styles.addrDim}>{middle}</Text>
      <Text style={styles.addrStrong}>{tail}</Text>
    </Text>
  );
}

export const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.l,
    padding: spacing.m,
    marginBottom: spacing.m,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 3,
  },
  cardHero: { backgroundColor: colors.elevated, borderColor: colors.borderStrong, padding: spacing.l },
  cardWarning: { backgroundColor: colors.redSoft, borderColor: "#583038" },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: "800", letterSpacing: -0.2, marginBottom: spacing.xs },
  cardSubtitle: { color: colors.sub, fontSize: 13, lineHeight: 19, marginBottom: spacing.m },
  btn: {
    minHeight: 50,
    backgroundColor: colors.elevated,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radius.m,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.s,
  },
  btnCompact: { minHeight: 42, paddingVertical: 9, paddingHorizontal: 12 },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnDanger: { backgroundColor: colors.redSoft, borderColor: "#65323B" },
  btnGhost: { backgroundColor: "transparent", borderColor: "transparent" },
  btnDisabled: { opacity: 0.42 },
  btnText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  btnTextPrimary: { color: colors.black },
  btnTextDanger: { color: colors.red },
  btnTextGhost: { color: colors.sub },
  inputWrap: { marginVertical: spacing.s },
  inputLabel: { color: colors.sub, fontSize: 12, fontWeight: "600", marginBottom: 7, letterSpacing: 0.2 },
  inputHint: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 6 },
  input: {
    minHeight: 50,
    backgroundColor: colors.inputBg,
    color: colors.text,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.m,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  inputMultiline: { minHeight: 94, textAlignVertical: "top" },
  badge: { alignSelf: "flex-start", backgroundColor: colors.elevated, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 5 },
  badgeAccent: { backgroundColor: colors.accentSoft },
  badgeGreen: { backgroundColor: colors.greenSoft },
  badgeRed: { backgroundColor: colors.redSoft },
  badgeText: { color: colors.sub, fontSize: 10, fontWeight: "800", letterSpacing: 0.7 },
  badgeTextAccent: { color: colors.accent },
  badgeTextGreen: { color: colors.green },
  badgeTextRed: { color: colors.red },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.s, marginTop: spacing.s },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  sectionAction: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
  infoLabel: { color: colors.sub, fontSize: 13 },
  infoValue: { color: colors.text, fontSize: 13, fontWeight: "700" },
  addr: { color: colors.text, fontFamily: "monospace", fontSize: 13, lineHeight: 21 },
  addrLarge: { fontSize: 15, lineHeight: 24 },
  addrStrong: { color: colors.accent, fontWeight: "800" },
  addrDim: { color: colors.sub },
});
