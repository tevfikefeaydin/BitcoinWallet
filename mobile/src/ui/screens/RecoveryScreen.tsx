import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { PinManager } from "../../core/PinManager";
import { Btn, Card, Input } from "../components";
import { colors, radius, spacing } from "../theme";

export function RecoveryScreen({ onRecovered, onCancel }: { onRecovered: () => void; onCancel: () => void }) {
  const [mnemonic, setMnemonic] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const recover = async () => {
    if (!/^\d{6,8}$/.test(pin)) return setError("Yeni PIN 6–8 haneli ve yalnızca rakamlardan oluşmalı.");
    if (pin !== pin2) return setError("PIN'ler eşleşmiyor.");
    setBusy(true);
    setError("");
    try {
      if (!(await PinManager.recoverWithMnemonic(mnemonic, pin))) {
        return setError("Kurtarma ifadesi cihazdaki cüzdanlarla eşleşmedi.");
      }
      onRecovered();
    } catch (e) {
      setError(`Kurtarma başarısız: ${(e as Error).message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.icon}><Text style={styles.iconText}>↺</Text></View>
      <Text style={styles.h1}>Cüzdan erişimini kurtarın</Text>
      <Text style={styles.lead}>Cihazdaki cüzdanlardan birinin 12 kelimesini doğrulayarak kilidi kaldırın ve yeni PIN belirleyin.</Text>
      <Card title="Kurtarma doğrulaması" subtitle="İfade yalnızca cihazdaki şifreli kayıtla yerel olarak karşılaştırılır.">
        <Input label="12 kelimelik ifade" value={mnemonic} onChangeText={setMnemonic} autoCapitalize="none" autoCorrect={false} secureTextEntry hint="Kelimeleri boşlukla ayırın; giriş ekranda maskelenir." />
        <Input label="Yeni PIN" value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={8} placeholder="6–8 hane" />
        <Input label="Yeni PIN tekrarı" value={pin2} onChangeText={setPin2} keyboardType="number-pad" secureTextEntry maxLength={8} />
        <Btn label="PIN'i güvenli sıfırla" kind="primary" onPress={recover} busy={busy} disabled={!mnemonic.trim() || pin.length < 6} />
        <Btn label="Vazgeç" kind="ghost" onPress={onCancel} disabled={busy} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.l, paddingTop: spacing.xxl },
  icon: { width: 54, height: 54, borderRadius: radius.m, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center", marginBottom: spacing.m },
  iconText: { color: colors.accent, fontSize: 28, fontWeight: "800" },
  h1: { color: colors.text, fontSize: 30, lineHeight: 36, fontWeight: "900", letterSpacing: -0.8 },
  lead: { color: colors.sub, fontSize: 14, lineHeight: 21, marginTop: spacing.s, marginBottom: spacing.l },
  error: { color: colors.red, backgroundColor: colors.redSoft, borderRadius: radius.m, padding: 12, marginTop: spacing.s },
});
