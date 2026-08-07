import React, { useEffect, useMemo, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { APP_CONFIG } from "../../core/config";
import { PinManager } from "../../core/PinManager";
import { SecureVault } from "../../core/SecureVault";
import { WalletEngine } from "../../core/WalletService";
import { WalletStore } from "../../core/WalletStore";
import type { AddressKind, Profile } from "../../core/types";
import { Badge, Btn, Card, Input } from "../components";
import { colors, radius, spacing } from "../theme";

type Step = "risk" | "pin" | "choose" | "backup" | "verify";
const VERIFY_INDEXES = [2, 6, 10];

function ScreenTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <View style={styles.intro}>
      <Image source={require("../../../assets/branding/btcwallet-logo-v1.png")} style={styles.logo} />
      <Badge label={eyebrow} tone={APP_CONFIG.isMainnet ? "red" : "accent"} />
      <Text style={styles.h1}>{title}</Text>
      <Text style={styles.lead}>{subtitle}</Text>
    </View>
  );
}

export function OnboardingScreen({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const [step, setStep] = useState<Step>(APP_CONFIG.isMainnet ? "risk" : "pin");
  const [pinConfigured, setPinConfigured] = useState(false);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [restoreText, setRestoreText] = useState("");
  const [watchDesc, setWatchDesc] = useState("");
  const [kind, setKind] = useState<AddressKind>("taproot");
  const [mnemonic, setMnemonic] = useState("");
  const [createdEngine, setCreatedEngine] = useState<WalletEngine | null>(null);
  const [verifyWords, setVerifyWords] = useState(["", "", ""]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const words = useMemo(() => mnemonic.split(" ").filter(Boolean), [mnemonic]);

  useEffect(() => {
    (async () => {
      const configured = await PinManager.isConfigured();
      setPinConfigured(configured);

      // Yedekleme ekranında uygulama kapanmışsa aynı cüzdanı güvenli biçimde devam ettir.
      const pending = (await WalletStore.list(profile)).find((wallet) => !wallet.watchOnly && !wallet.backupVerified);
      if (pending) {
        const secret = await SecureVault.getMnemonic(pending.id);
        if (secret && !secret.startsWith("DESC:")) {
          setMnemonic(secret);
          setCreatedEngine(await WalletEngine.open(pending));
          setStep("backup");
          return;
        }
      }

      if (!APP_CONFIG.isMainnet && configured) setStep("choose");
    })().catch((e) => setError((e as Error).message));
  }, [profile]);

  const savePin = async () => {
    if (!/^\d{6,8}$/.test(pin)) return setError("PIN 6–8 haneli ve yalnızca rakamlardan oluşmalı.");
    if (pin !== pin2) return setError("PIN'ler eşleşmiyor.");
    setBusy(true);
    try {
      await PinManager.setPin(pin);
      setPinConfigured(true);
      setError("");
      setStep("choose");
    } catch (e) {
      setError(`PIN kaydedilemedi: ${(e as Error).message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const createWallet = async () => {
    setBusy(true);
    setError("");
    try {
      const { engine, mnemonic: generated } = await WalletEngine.createNew("Cüzdanım", kind, profile);
      setCreatedEngine(engine);
      setMnemonic(generated);
      setStep("backup");
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const verifyBackup = async () => {
    const correct = VERIFY_INDEXES.every(
      (wordIndex, inputIndex) => verifyWords[inputIndex].trim().toLowerCase() === words[wordIndex],
    );
    if (!correct) return setError("Kelimeler eşleşmedi. Kağıt yedeğinizi tekrar kontrol edin.");
    if (!createdEngine) return setError("Doğrulanacak cüzdan bulunamadı.");
    setBusy(true);
    try {
      await createdEngine.markBackupVerified();
      setMnemonic("");
      setVerifyWords(["", "", ""]);
      onDone();
    } catch (e) {
      setError(`Yedek doğrulanamadı: ${(e as Error).message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const restoreWallet = async () => {
    setBusy(true);
    setError("");
    try {
      await WalletEngine.restore("Cüzdanım", restoreText, kind, profile);
      onDone();
    } catch {
      setError("Geçersiz veya bu ağa ait olmayan kurtarma ifadesi.");
    } finally {
      setBusy(false);
    }
  };

  const addWatchOnly = async () => {
    setBusy(true);
    setError("");
    try {
      await WalletEngine.addWatchOnly("İzleme", watchDesc, profile);
      onDone();
    } catch {
      setError("Descriptor geçersiz veya yanlış Bitcoin ağına ait.");
    } finally {
      setBusy(false);
    }
  };

  if (step === "risk") {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <ScreenTitle eyebrow="GERÇEK BITCOIN AĞI" title="Mainnet'e hoş geldiniz" subtitle="Bu sürüm gerçek BTC ile gerçek işlemler oluşturur. Önce güvenlik sınırlarını açıkça kabul edin." />
        <Card variant="warning" title="Kayıp işlemler geri alınamaz">
          <Text style={styles.warningText}>• İlk denemeyi çok küçük bir miktarla yapın.</Text>
          <Text style={styles.warningText}>• 12 kelimeyi çevrimdışı ve fiziksel olarak saklayın.</Text>
          <Text style={styles.warningText}>• Root'lu cihaz, ekran paylaşımı ve bilinmeyen APK kaynaklarından kaçının.</Text>
          <Text style={styles.warningText}>• Bu ön sürüm bağımsız güvenlik denetiminden geçmiş değildir.</Text>
        </Card>
        <Btn label="Riskleri anladım, devam et" kind="primary" onPress={() => setStep(pinConfigured ? "choose" : "pin")} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    );
  }

  if (step === "pin") {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle eyebrow={`${APP_CONFIG.networkLabel} • ADIM 1/2`} title="Kasayı kilitleyin" subtitle="PIN, cihazdaki şifreli anahtar kasasına erişimi korur. Benzersiz ve tahmin edilmesi zor bir sayı seçin." />
        <Card title="Güvenli PIN" subtitle="Beş hatalı denemeden sonra yalnızca kurtarma ifadenizle sıfırlanabilir.">
          <Input label="PIN" value={pin} onChangeText={setPin} placeholder="6–8 hane" secureTextEntry keyboardType="number-pad" maxLength={8} />
          <Input label="PIN tekrarı" value={pin2} onChangeText={setPin2} placeholder="Aynı PIN" secureTextEntry keyboardType="number-pad" maxLength={8} />
          <Btn label="PIN'i güvenli kaydet" kind="primary" onPress={savePin} busy={busy} disabled={pin.length < 6 || pin2.length < 6} />
        </Card>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    );
  }

  if (step === "backup") {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <ScreenTitle eyebrow="YEDEKLEME • ADIM 1/2" title="12 kelimeyi çevrimdışı yazın" subtitle="Bu kelimeler paranızın tek kurtarma anahtarıdır. Fotoğrafını çekmeyin, buluta veya mesaja kaydetmeyin." />
        <Card variant="hero">
          <View style={styles.words}>
            {words.map((word, index) => (
              <View key={index} style={styles.wordChip}>
                <Text style={styles.wordIndex}>{index + 1}</Text>
                <Text style={styles.word}>{word}</Text>
              </View>
            ))}
          </View>
        </Card>
        <Btn label="Yazdım, kelimeleri doğrula" kind="primary" onPress={() => { setError(""); setStep("verify"); }} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    );
  }

  if (step === "verify") {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle eyebrow="YEDEKLEME • ADIM 2/2" title="Kağıt yedeğinizi doğrulayın" subtitle="İstenen üç kelimeyi yedeğinizden girin. Bu adım tamamlanmadan mainnet gönderimi açılmaz." />
        <Card title="Eksik kelimeler">
          {VERIFY_INDEXES.map((wordIndex, inputIndex) => (
            <Input
              key={wordIndex}
              label={`${wordIndex + 1}. kelime`}
              value={verifyWords[inputIndex]}
              onChangeText={(value) => setVerifyWords((all) => all.map((item, i) => (i === inputIndex ? value : item)))}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Yedeğinizdeki kelime"
            />
          ))}
          <Btn label="Yedeği doğrula ve cüzdanı aç" kind="primary" onPress={verifyBackup} busy={busy} disabled={verifyWords.some((word) => !word.trim())} />
          <Btn label="Kelimelere geri dön" kind="ghost" onPress={() => setStep("backup")} disabled={busy} />
        </Card>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenTitle eyebrow={`${APP_CONFIG.networkLabel} • ADIM 2/2`} title="Cüzdanınızı seçin" subtitle="Yeni bir anahtar üretin, mevcut 12 kelimenizi geri yükleyin veya yalnızca izleme cüzdanı ekleyin." />

      <Card title="Adres standardı" subtitle="Taproot daha modern ve verimlidir; SegWit geniş uyumluluk sağlar.">
        <View style={styles.row}>
          <View style={styles.flex}><Btn compact label={`Taproot ${kind === "taproot" ? "✓" : ""}`} kind={kind === "taproot" ? "primary" : "default"} onPress={() => setKind("taproot")} /></View>
          <View style={styles.flex}><Btn compact label={`SegWit ${kind === "segwit" ? "✓" : ""}`} kind={kind === "segwit" ? "primary" : "default"} onPress={() => setKind("segwit")} /></View>
        </View>
      </Card>

      <Card title="Yeni cüzdan" subtitle="Anahtarlar bu cihazda native kriptografik rastgelelikle üretilir.">
        <Btn label="Yeni cüzdan oluştur" kind="primary" onPress={createWallet} busy={busy} />
      </Card>

      <Card title="Kurtarma ifadesinden geri yükle">
        <Input value={restoreText} onChangeText={setRestoreText} placeholder="12 kelimelik kurtarma ifadesi" autoCapitalize="none" autoCorrect={false} secureTextEntry hint="Kelimeleri boşlukla ayırın; giriş ekranda maskelenir." />
        <Btn label="Cüzdanı geri yükle" onPress={restoreWallet} busy={busy} disabled={!restoreText.trim()} />
      </Card>

      <Card title="Watch-only ekle" subtitle="Bakiyeyi izler; bu cihazda özel anahtar ve gönderim yetkisi bulunmaz.">
        <Input value={watchDesc} onChangeText={setWatchDesc} placeholder="Public descriptor: tr(xpub…/0/*)" multiline autoCapitalize="none" autoCorrect={false} />
        <Btn label="İzleme cüzdanı ekle" onPress={addWatchOnly} busy={busy} disabled={!watchDesc.trim()} />
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.m, paddingBottom: spacing.xxl },
  intro: { alignItems: "flex-start", paddingTop: spacing.m, paddingBottom: spacing.l },
  logo: { width: 52, height: 52, borderRadius: radius.m, backgroundColor: colors.black, marginBottom: spacing.m },
  h1: { color: colors.text, fontSize: 31, lineHeight: 37, fontWeight: "900", letterSpacing: -1, marginTop: spacing.s },
  lead: { color: colors.sub, fontSize: 14, lineHeight: 21, marginTop: spacing.s, maxWidth: 520 },
  warningText: { color: colors.text, fontSize: 13, lineHeight: 21, marginTop: spacing.xs },
  words: { flexDirection: "row", flexWrap: "wrap", gap: spacing.s },
  wordChip: { width: "31%", minWidth: 92, backgroundColor: colors.inputBg, borderColor: colors.border, borderWidth: 1, borderRadius: radius.m, padding: 10 },
  wordIndex: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  word: { color: colors.text, fontSize: 14, fontWeight: "700", marginTop: 3 },
  error: { color: colors.red, backgroundColor: colors.redSoft, borderRadius: radius.m, padding: 12, marginTop: spacing.s, lineHeight: 19 },
  row: { flexDirection: "row", gap: spacing.s },
  flex: { flex: 1 },
});
