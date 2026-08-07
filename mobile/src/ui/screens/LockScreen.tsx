import React, { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { APP_CONFIG } from "../../core/config";
import { PinManager } from "../../core/PinManager";
import type { Profile } from "../../core/types";
import { Badge, Btn, Card, Input } from "../components";
import { colors, radius, spacing } from "../theme";

export function LockScreen({ onUnlock, onRecover }: { onUnlock: (profile: Profile) => void; onRecover: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy || pin.length < 6) return;
    setBusy(true);
    try {
      const result = await PinManager.verify(pin);
      setPin("");
      if (result === "locked") {
        setError("Deneme sınırı aşıldı. Kurtarma ifadenizle PIN'i sıfırlayın.");
        return;
      }
      if (result === null) {
        setError(`PIN hatalı · ${await PinManager.remainingAttempts()} deneme kaldı`);
        return;
      }
      setError("");
      onUnlock(result);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={styles.brand}>
        <Image source={require("../../../assets/branding/btcwallet-logo-v1.png")} style={styles.logo} />
        <Badge label={APP_CONFIG.networkLabel} tone={APP_CONFIG.isMainnet ? "red" : "accent"} />
        <Text style={styles.title}>BTC Wallet</Text>
        <Text style={styles.subtitle}>Anahtarlarınız cihazınızda. Cüzdanınızı açmak için güvenli PIN'inizi girin.</Text>
      </View>
      <Card style={styles.lockCard}>
        <Input
          label="GÜVENLİ PIN"
          value={pin}
          onChangeText={setPin}
          placeholder="••••••"
          secureTextEntry
          keyboardType="number-pad"
          maxLength={8}
          returnKeyType="done"
          onSubmitEditing={submit}
          style={styles.pinInput}
        />
        <Btn label="Cüzdanı aç" kind="primary" onPress={submit} disabled={pin.length < 6} busy={busy} />
        <Btn label="PIN'i unuttum" kind="ghost" onPress={onRecover} disabled={busy} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Card>
      <View style={styles.securityLine}><View style={styles.securityDot} /><Text style={styles.securityText}>Yerel şifreleme · Otomatik kilit · Ekran koruması</Text></View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: spacing.l },
  brand: { alignItems: "center", marginBottom: spacing.l },
  logo: { width: 66, height: 66, borderRadius: radius.l, backgroundColor: colors.black, marginBottom: spacing.m },
  title: { fontSize: 30, fontWeight: "900", color: colors.text, letterSpacing: -0.8, marginTop: spacing.s },
  subtitle: { color: colors.sub, fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: spacing.s, maxWidth: 340 },
  lockCard: { marginBottom: spacing.m },
  error: { color: colors.red, textAlign: "center", marginTop: spacing.m, fontSize: 12 },
  pinInput: { textAlign: "center", fontSize: 24, letterSpacing: 8 },
  securityLine: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  securityDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  securityText: { color: colors.muted, fontSize: 11 },
});
