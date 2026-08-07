// BTC Wallet — non-custodial testnet cüzdanı (Unstoppable Wallet'tan esinlenen güvenlik modeli)
// Akış: PIN kur → cüzdan oluştur → kilit ekranı → ana ekran. Arka plana geçince otomatik kilit.
import "react-native-get-random-values";
import React, { useEffect, useRef, useState } from "react";
import { AppState, StatusBar, StyleSheet, Text, View } from "react-native";
import { uniffiInitAsync } from "bdk-rn";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { PinManager } from "./src/core/PinManager";
import { WalletStore } from "./src/core/WalletStore";
import { AUTO_LOCK_SECONDS, type Profile } from "./src/core/types";
import { colors } from "./src/ui/theme";
import { HomeScreen } from "./src/ui/screens/HomeScreen";
import { LockScreen } from "./src/ui/screens/LockScreen";
import { OnboardingScreen } from "./src/ui/screens/OnboardingScreen";
import { RecoveryScreen } from "./src/ui/screens/RecoveryScreen";

type AppPhase = "loading" | "onboarding" | "locked" | "recovery" | "unlocked";

export default function App() {
  const [phase, setPhase] = useState<AppPhase>("loading");
  const [profile, setProfile] = useState<Profile>("main");
  const [onboardingProfile, setOnboardingProfile] = useState<Profile>("main");
  const [fatalError, setFatalError] = useState("");
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await uniffiInitAsync();
        const hasPin = await PinManager.isConfigured();
        const wallets = await WalletStore.list();
        if (!hasPin || wallets.length === 0) setPhase("onboarding");
        else setPhase("locked");
      } catch (error) {
        setFatalError(`Cüzdan motoru başlatılamadı: ${(error as Error).message ?? error}`);
      }
    })();
  }, []);

  // Otomatik kilit: uygulama arka plana geçtikten AUTO_LOCK_SECONDS sonra kilitle
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        backgroundedAt.current = Date.now();
      } else if (state === "active" && backgroundedAt.current !== null) {
        const elapsed = (Date.now() - backgroundedAt.current) / 1000;
        backgroundedAt.current = null;
        if (elapsed > AUTO_LOCK_SECONDS) {
          setPhase((p) => (p === "unlocked" ? "locked" : p));
        }
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        {fatalError ? (
          <View style={styles.fatal}>
            <Text style={styles.fatalTitle}>Güvenli başlatma başarısız</Text>
            <Text style={styles.fatalText}>{fatalError}</Text>
          </View>
        ) : null}
        {!fatalError && phase === "onboarding" && <OnboardingScreen profile={onboardingProfile} onDone={() => setPhase("locked")} />}
        {phase === "locked" && (
          <LockScreen
            onRecover={() => setPhase("recovery")}
            onUnlock={(p) => {
              setProfile(p);
              setPhase("unlocked");
            }}
          />
        )}
        {phase === "recovery" && <RecoveryScreen onRecovered={() => setPhase("locked")} onCancel={() => setPhase("locked")} />}
        {phase === "unlocked" && (
          <HomeScreen
            profile={profile}
            onAddWallet={(targetProfile = profile) => {
              setOnboardingProfile(targetProfile);
              setPhase("onboarding");
            }}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  fatal: { flex: 1, justifyContent: "center", padding: 24 },
  fatalTitle: { color: colors.red, fontSize: 22, fontWeight: "800", marginBottom: 12 },
  fatalText: { color: colors.text, fontSize: 14, lineHeight: 21 },
});
