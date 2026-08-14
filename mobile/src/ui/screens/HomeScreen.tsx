import Clipboard from "@react-native-clipboard/clipboard";
import React, { useCallback, useEffect, useState } from "react";
import QRCode from "react-native-qrcode-svg";
import {
  Image,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { findPoisoningSuspects } from "../../core/antiPhishing";
import { buildBitcoinPaymentUri, parseBitcoinPayment } from "../../core/bitcoinUri";
import { APP_CONFIG } from "../../core/config";
import {
  checkEsploraServer,
  configuredEsploraServers,
  normalizeEsploraUrl,
} from "../../core/EsploraService";
import { formatBitcoin, formatBtc, formatSat, formatUsd } from "../../core/format";
import { PinManager } from "../../core/PinManager";
import { PriceService } from "../../core/PriceService";
import { SecureVault } from "../../core/SecureVault";
import type { FeeChoices, PreparedSend, ReceiveAddressInfo } from "../../core/WalletService";
import { WalletEngine } from "../../core/WalletService";
import { WalletStore } from "../../core/WalletStore";
import type {
  BalanceUnit,
  EsploraHealth,
  EsploraMode,
  EsploraServer,
  FiatQuote,
  Profile,
  TxItem,
  WalletMeta,
} from "../../core/types";
import { AddressText, Badge, Btn, Card, InfoRow, Input, SectionHeader } from "../components";
import { colors, radius, spacing } from "../theme";

type Tab = "wallet" | "send" | "settings";

export function HomeScreen({ profile, onAddWallet }: { profile: Profile; onAddWallet: (profile?: Profile) => void }) {
  const [tab, setTab] = useState<Tab>("wallet");
  const [wallets, setWallets] = useState<WalletMeta[]>([]);
  const [engine, setEngine] = useState<WalletEngine | null>(null);
  const [balance, setBalance] = useState({ confirmedSat: 0, pendingSat: 0, totalSat: 0 });
  const [txs, setTxs] = useState<TxItem[]>([]);
  const [address, setAddress] = useState("");
  const [addressInfo, setAddressInfo] = useState<ReceiveAddressInfo | null>(null);
  const [receiveAmount, setReceiveAmount] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState("");
  const [displayUnit, setDisplayUnit] = useState<BalanceUnit>("btc");
  const [fiatQuote, setFiatQuote] = useState<FiatQuote | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [feeRate, setFeeRate] = useState("1");
  const [fees, setFees] = useState<FeeChoices | null>(null);
  const [phishWarning, setPhishWarning] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingSend, setPendingSend] = useState<PreparedSend | null>(null);
  const [confirmTail, setConfirmTail] = useState("");
  const [sendError, setSendError] = useState("");
  const [sendAll, setSendAll] = useState(false);
  const [paymentRequestNote, setPaymentRequestNote] = useState("");
  const [paymentInputError, setPaymentInputError] = useState("");
  const [selectedTx, setSelectedTx] = useState<TxItem | null>(null);

  const [duressPin, setDuressPin] = useState("");
  const [serverUrl, setServerUrl] = useState(APP_CONFIG.esploraServers[0].baseUrl);
  const [serverMode, setServerMode] = useState<EsploraMode>("automatic");
  const [servers, setServers] = useState<EsploraServer[]>(APP_CONFIG.esploraServers);
  const [serverHealth, setServerHealth] = useState<Record<string, EsploraHealth>>({});
  const [checkingServers, setCheckingServers] = useState(false);
  const [customServerUrl, setCustomServerUrl] = useState("");
  const [vaultLevel, setVaultLevel] = useState<"hardware" | "software" | "unknown">("unknown");

  const openWallet = useCallback(async (meta: WalletMeta) => {
    setSyncing(true);
    setMsg("");
    try {
      const opened = await WalletEngine.open(meta);
      setEngine(opened);
      // Alma adresi ve yerel kalıcı durum ağ bağlantısını beklemeden gösterilir.
      const initialAddress = await opened.receiveAddress(false);
      setAddress(initialAddress.address);
      setAddressInfo(initialAddress);
      setBalance(await opened.balance());
      setTxs(await opened.transactions());
      await opened.sync();
      setBalance(await opened.balance());
      setTxs(await opened.transactions());
      const syncedAddress = await opened.receiveAddress(false);
      setAddress(syncedAddress.address);
      setAddressInfo(syncedAddress);
      try {
        const estimates = await opened.feeEstimates();
        setFees(estimates);
        setFeeRate(String(estimates.normalSatVb));
      } catch {
        setFees(null);
      }
    } catch (e) {
      setMsg(`Hata: ${(e as Error).message ?? e}`);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const list = await WalletStore.list(profile);
      const valid: WalletMeta[] = [];
      const seenSecrets = new Set<string>();
      let removed = 0;
      for (const wallet of list) {
        const secret = await SecureVault.getMnemonic(wallet.id);
        const duplicateKey = `${secret}|${wallet.addressKind}|${wallet.network ?? "testnet"}`;
        if (!secret || seenSecrets.has(duplicateKey)) {
          await WalletStore.remove(wallet.id);
          removed += 1;
        } else {
          seenSecrets.add(duplicateKey);
          valid.push(wallet);
        }
      }
      if (removed) setMsg(`${removed} geçersiz veya mükerrer cüzdan kaydı temizlendi.`);
      setWallets(valid);
      const [saved, mode, unit, configured] = await Promise.all([
        WalletStore.getEsploraUrl(),
        WalletStore.getEsploraMode(),
        WalletStore.getBalanceUnit(),
        configuredEsploraServers(),
      ]);
      if (saved) setServerUrl(saved);
      setServerMode(mode);
      setDisplayUnit(unit);
      setServers(configured);
      PriceService.getUsdQuote().then(setFiatQuote).catch(() => setFiatQuote(null));
      setVaultLevel(await SecureVault.securityLevel());
      if (valid.length) await openWallet(valid[0]);
    })().catch((e) => setMsg(`Başlatma hatası: ${(e as Error).message ?? e}`));
  }, [profile, openWallet]);

  const refreshPrice = async () => {
    setPriceLoading(true);
    try {
      setFiatQuote(await PriceService.getUsdQuote(true));
    } finally {
      setPriceLoading(false);
    }
  };

  const refresh = async () => {
    if (engine) await openWallet(engine.meta);
    await refreshPrice();
  };

  const copyAddress = async () => {
    if (!address) return;
    Clipboard.setString(address);
    setMsg("Alma adresi kopyalandı; pano 60 saniye sonra temizlenecek.");
    const copied = address;
    setTimeout(async () => {
      try {
        if ((await Clipboard.getString()) === copied) Clipboard.setString("");
      } catch {}
    }, 60_000);
  };

  const copyPaymentRequest = async (paymentRequest: string) => {
    if (!paymentRequest) return;
    Clipboard.setString(paymentRequest);
    setMsg("BIP21 ödeme isteği kopyalandı; pano 60 saniye sonra temizlenecek.");
    setTimeout(async () => {
      try {
        if ((await Clipboard.getString()) === paymentRequest) Clipboard.setString("");
      } catch {}
    }, 60_000);
  };

  const generateFreshAddress = async () => {
    if (!engine) return;
    setMsg("");
    try {
      const next = await engine.receiveAddress(true);
      setAddress(next.address);
      setAddressInfo(next);
      setMsg(`Yeni alma adresi ayrıldı · indeks #${next.index}. Eski adresleriniz geçerliliğini korur.`);
    } catch (error) {
      setMsg(`Adres üretilemedi: ${(error as Error).message ?? error}`);
    }
  };

  const chooseDisplayUnit = async (unit: BalanceUnit) => {
    setDisplayUnit(unit);
    await WalletStore.setBalanceUnit(unit);
  };

  const applyPaymentInput = async (value: string) => {
    setPaymentInputError("");
    if (!value.trim()) {
      setSendTo("");
      setPaymentRequestNote("");
      setPhishWarning("");
      return;
    }
    let payment;
    try {
      payment = parseBitcoinPayment(value);
    } catch (error) {
      setSendTo(value);
      setPaymentRequestNote("");
      setPaymentInputError((error as Error).message);
      return;
    }

    setSendTo(payment.address);
    setPaymentRequestNote([payment.label, payment.message].filter(Boolean).join(" · "));
    if (payment.amountSat !== undefined) {
      setSendAmount(String(payment.amountSat));
      setSendAll(false);
    }
    const suspects = findPoisoningSuspects(payment.address, await WalletStore.knownRecipients());
    setPhishWarning(
      suspects.length
        ? "Bu adres daha önce kullandığınız bir adrese tehlikeli ölçüde benziyor. Adres zehirleme riski için tamamını doğrulayın."
        : "",
    );
  };

  const pastePaymentRequest = async () => {
    try {
      const value = await Clipboard.getString();
      if (!value.trim()) throw new Error("Panoda Bitcoin adresi veya ödeme isteği bulunamadı.");
      await applyPaymentInput(value);
    } catch (error) {
      setPaymentInputError((error as Error).message);
    }
  };

  const prepareSend = async () => {
    if (!engine) return;
    setSending(true);
    setMsg("");
    setSendError("");
    try {
      const prepared = await engine.prepareSend(sendTo, Number(sendAmount), Number(feeRate), sendAll);
      setConfirmTail("");
      setPendingSend(prepared);
    } catch (e) {
      setMsg(`Gönderim hazırlanamadı: ${(e as Error).message ?? e}`);
    } finally {
      setSending(false);
    }
  };

  const confirmSend = async () => {
    if (!engine || !pendingSend) return;
    if (APP_CONFIG.isMainnet && confirmTail.trim().toLowerCase() !== pendingSend.toAddress.slice(-4).toLowerCase()) {
      setSendError("Adresin son dört karakteri eşleşmiyor.");
      return;
    }
    setSending(true);
    setSendError("");
    try {
      const txid = await engine.broadcastPrepared(pendingSend);
      setPendingSend(null);
      setMsg(`İşlem yayınlandı: ${txid.slice(0, 16)}…`);
      setSendTo("");
      setSendAmount("");
      setSendAll(false);
      setPaymentRequestNote("");
      setConfirmTail("");
      await refresh();
      setTab("wallet");
    } catch (e) {
      setSendError(`Yayın başarısız: ${(e as Error).message ?? e}`);
    } finally {
      setSending(false);
    }
  };

  const saveDuress = async () => {
    try {
      await PinManager.setDuressPin(duressPin);
      setDuressPin("");
      setMsg("Duress PIN kaydedildi. Bu PIN yalnızca ayrı decoy profilini açar.");
    } catch (e) {
      setMsg(String((e as Error).message ?? e));
    }
  };

  const saveServer = async (url: string) => {
    setServerUrl(url);
    await WalletStore.setEsploraUrl(url);
    setMsg(
      serverMode === "automatic"
        ? "Birincil Esplora değiştirildi; ulaşılamazsa doğrulanmış yedek sunucu kullanılacak."
        : "Esplora sunucusu değiştirildi. Manuel modda otomatik geçiş yapılmaz.",
    );
  };

  const chooseServerMode = async (mode: EsploraMode) => {
    setServerMode(mode);
    await WalletStore.setEsploraMode(mode);
    setMsg(mode === "automatic" ? "Sağlık kontrollü Esplora fallback etkin." : "Manuel Esplora modu etkin.");
  };

  const checkServers = async () => {
    setCheckingServers(true);
    setMsg("");
    try {
      const results = await Promise.all(servers.map((server) => checkEsploraServer(server, true)));
      setServerHealth(Object.fromEntries(results.map((health) => [health.baseUrl, health])));
      const healthyCount = results.filter((health) => health.healthy).length;
      setMsg(`${healthyCount}/${results.length} Esplora sunucusu doğru ${APP_CONFIG.networkLabel} ağıyla yanıt verdi.`);
    } finally {
      setCheckingServers(false);
    }
  };

  const addCustomServer = async () => {
    setCheckingServers(true);
    setMsg("");
    try {
      const baseUrl = normalizeEsploraUrl(customServerUrl);
      const host = new URL(baseUrl).hostname;
      const server: EsploraServer = { name: `${host} · Kişisel`, baseUrl, custom: true };
      const health = await checkEsploraServer(server, true);
      if (!health.healthy) throw new Error(health.error ?? "Sunucu doğrulanamadı.");
      await WalletStore.addCustomEsploraServer(server);
      await WalletStore.setEsploraUrl(baseUrl);
      setServerUrl(baseUrl);
      setServers(await configuredEsploraServers());
      setServerHealth((current) => ({ ...current, [baseUrl]: health }));
      setCustomServerUrl("");
      setMsg(`Kişisel Esplora doğrulandı ve birincil sunucu yapıldı · blok ${health.height}.`);
    } catch (error) {
      setMsg(`Özel sunucu eklenemedi: ${(error as Error).message ?? error}`);
    } finally {
      setCheckingServers(false);
    }
  };

  const removeCustomServer = async (baseUrl: string) => {
    await WalletStore.removeCustomEsploraServer(baseUrl);
    const configured = await configuredEsploraServers();
    const selected = (await WalletStore.getEsploraUrl()) ?? configured[0].baseUrl;
    setServers(configured);
    setServerUrl(selected);
    setServerHealth((current) => {
      const next = { ...current };
      delete next[baseUrl];
      return next;
    });
    setMsg("Kişisel Esplora kaydı kaldırıldı.");
  };

  const feeWarning = pendingSend && pendingSend.feeSat > pendingSend.amountSat * 0.1;
  const expectedTail = pendingSend?.toAddress.slice(-4) ?? "";
  const primaryBalance = formatBitcoin(balance.totalSat, displayUnit, APP_CONFIG.ticker);
  const secondaryBalance =
    displayUnit === "btc" ? formatSat(balance.totalSat) : formatBtc(balance.totalSat, APP_CONFIG.ticker);
  const usdBalance = APP_CONFIG.isMainnet ? formatUsd(balance.totalSat, fiatQuote?.usd) : null;
  const messageIsError = /hata|başarısız|üretilemedi|eklenemedi|bulunamadı|eşleşmedi/i.test(msg);
  const sendAmountSat = Number(sendAmount);
  const sendAmountHint = !sendAmount
    ? "1 BTC = 100.000.000 satoshi"
    : Number.isSafeInteger(sendAmountSat) && sendAmountSat >= 0
      ? `${formatBtc(sendAmountSat, APP_CONFIG.ticker)}${formatUsd(sendAmountSat, fiatQuote?.usd) ? ` · ≈ ${formatUsd(sendAmountSat, fiatQuote?.usd)}` : ""}`
      : "Miktar güvenli tam satoshi aralığında olmalı.";
  const receiveAmountSat = Number(receiveAmount);
  const receiveAmountValid =
    !receiveAmount ||
    (Number.isSafeInteger(receiveAmountSat) && receiveAmountSat > 0 && receiveAmountSat <= 2_100_000_000_000_000);
  const paymentRequestUri = address
    ? buildBitcoinPaymentUri(address, receiveAmountValid && receiveAmount ? receiveAmountSat : undefined)
    : "";
  const selectedTxNet = selectedTx ? selectedTx.receivedSat - selectedTx.sentSat : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Image source={require("../../../assets/branding/btcwallet-logo-v1.png")} style={styles.brandLogo} />
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>BTC WALLET</Text>
          <Text style={styles.walletName} numberOfLines={1}>{engine?.meta.name ?? "Cüzdan yükleniyor"}</Text>
        </View>
        <Badge label={APP_CONFIG.networkLabel} tone={APP_CONFIG.isMainnet ? "red" : "accent"} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accent]} />}
        keyboardShouldPersistTaps="handled"
      >
        {tab === "wallet" ? (
          <>
            <Card variant="hero" style={styles.balanceCard}>
              <View style={styles.balanceTop}>
                <Text style={styles.balanceLabel}>TOPLAM BAKİYE</Text>
                <View style={[styles.syncDot, syncing && styles.syncDotBusy]} />
              </View>
              <TouchableOpacity
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Bakiye birimini değiştir"
                onPress={() => chooseDisplayUnit(displayUnit === "btc" ? "sat" : "btc")}
              >
                <Text style={styles.balance}>{primaryBalance}</Text>
                <Text style={styles.sats}>{secondaryBalance}</Text>
                <Text style={styles.usdBalance}>
                  {usdBalance ? `≈ ${usdBalance}` : priceLoading ? "USD fiyatı güncelleniyor…" : "USD fiyatı kullanılamıyor"}
                  {fiatQuote?.stale ? " · eski fiyat" : ""}
                </Text>
              </TouchableOpacity>
              <View style={styles.unitRow}>
                {(["btc", "sat"] as const).map((unit) => (
                  <TouchableOpacity
                    key={unit}
                    style={[styles.unitPill, displayUnit === unit && styles.unitPillActive]}
                    onPress={() => chooseDisplayUnit(unit)}
                  >
                    <Text style={[styles.unitPillText, displayUnit === unit && styles.unitPillTextActive]}>
                      {unit.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.balanceDivider} />
              <View style={styles.balanceStats}>
                <View style={styles.stat}><Text style={styles.statLabel}>Onaylı</Text><Text style={styles.statValue}>{formatBitcoin(balance.confirmedSat, displayUnit, APP_CONFIG.ticker)}</Text></View>
                <View style={styles.stat}><Text style={styles.statLabel}>Bekleyen</Text><Text style={[styles.statValue, balance.pendingSat > 0 && styles.accent]}>{formatBitcoin(balance.pendingSat, displayUnit, APP_CONFIG.ticker)}</Text></View>
              </View>
            </Card>

            <View style={styles.quickRow}>
              <TouchableOpacity style={styles.quickAction} onPress={() => setTab("send")}><View style={styles.quickIcon}><Text style={styles.quickIconText}>↗</Text></View><Text style={styles.quickLabel}>Gönder</Text></TouchableOpacity>
              <TouchableOpacity style={styles.quickAction} onPress={copyAddress}><View style={styles.quickIcon}><Text style={styles.quickIconText}>↓</Text></View><Text style={styles.quickLabel}>Adres kopyala</Text></TouchableOpacity>
              <TouchableOpacity style={styles.quickAction} onPress={refresh}><View style={styles.quickIcon}><Text style={styles.quickIconText}>↻</Text></View><Text style={styles.quickLabel}>Yenile</Text></TouchableOpacity>
            </View>

            {engine && !engine.meta.watchOnly && !engine.meta.backupVerified ? (
              <Card variant="warning" title="Yedekleme tamamlanmadı" subtitle="Kurtarma kelimelerini doğrulamadan mainnet gönderimi kapalıdır.">
                <Btn compact label="Yedeklemeye devam et" kind="danger" onPress={() => onAddWallet(profile)} />
              </Card>
            ) : null}

            <SectionHeader title="Alma adresi" action={engine?.meta.addressKind === "taproot" ? "TAPROOT" : "SEGWIT"} />
            <Card>
              {paymentRequestUri ? (
                <View style={styles.qrWrap}>
                  <QRCode
                    value={paymentRequestUri}
                    size={188}
                    color="#0A0B0D"
                    backgroundColor="#FFFFFF"
                    ecl="M"
                  />
                </View>
              ) : null}
              <TouchableOpacity activeOpacity={0.72} onPress={copyAddress}>
                <AddressText address={address || "Adres hazırlanıyor…"} large />
                <Text style={styles.copyHint}>Dokunarak kopyala</Text>
              </TouchableOpacity>
              {addressInfo ? (
                <View style={styles.addressMetaRow}>
                  <Text style={styles.addressMeta}>Türetme indeksi #{addressInfo.index}</Text>
                  <Text style={styles.addressMeta}>{addressInfo.unusedCount}/{addressInfo.unusedLimit} kullanılmamış</Text>
                </View>
              ) : null}
              <Input
                label="TALEP EDİLEN TUTAR · SAT (İSTEĞE BAĞLI)"
                value={receiveAmount}
                onChangeText={setReceiveAmount}
                keyboardType="number-pad"
                placeholder="Örn. 25000"
                hint="Tutar yalnızca QR/BIP21 isteğine eklenir; gönderen son onayı kendisi verir."
              />
              {!receiveAmountValid ? <Text style={styles.warning}>QR tutarı pozitif bir tam satoshi değeri olmalı.</Text> : null}
              <Btn compact label="BIP21 ödeme isteğini kopyala" onPress={() => copyPaymentRequest(paymentRequestUri)} disabled={!paymentRequestUri || !receiveAmountValid} />
              <Btn compact label="Farklı alma adresi ayır" onPress={generateFreshAddress} disabled={!engine} />
              <Text style={styles.privacyHint}>Her ödeme için farklı adres gizliliği artırır. Eski adresleriniz ödeme almaya devam eder.</Text>
            </Card>

            <SectionHeader title="Son işlemler" action={txs.length ? `${txs.length} İŞLEM` : undefined} />
            <Card>
              {!txs.length ? (
                <View style={styles.empty}><Text style={styles.emptyIcon}>⌁</Text><Text style={styles.emptyTitle}>Henüz işlem yok</Text><Text style={styles.emptySub}>Yeni işlemler senkronizasyondan sonra burada görünür.</Text></View>
              ) : txs.map((tx, index) => {
                const net = tx.receivedSat - tx.sentSat;
                return (
                  <TouchableOpacity
                    key={tx.txid}
                    style={[styles.txRow, index === txs.length - 1 && styles.txRowLast]}
                    onPress={() => setSelectedTx(tx)}
                  >
                    <View style={[styles.txIcon, net >= 0 ? styles.txIconIn : styles.txIconOut]}><Text style={net >= 0 ? styles.green : styles.red}>{net >= 0 ? "↓" : "↑"}</Text></View>
                    <View style={styles.txMeta}><Text style={styles.txTitle}>{net >= 0 ? "Alındı" : "Gönderildi"}</Text><Text style={styles.txId}>{tx.txid.slice(0, 8)}…{tx.txid.slice(-6)}</Text></View>
                    <View style={styles.txRight}><Text style={[styles.txAmount, net >= 0 ? styles.green : styles.red]}>{net >= 0 ? "+" : ""}{formatBitcoin(net, displayUnit, APP_CONFIG.ticker)}</Text><Text style={[styles.txStatus, tx.confirmed ? styles.green : styles.accent]}>{tx.confirmed ? "Onaylandı" : "Bekliyor"} · Ayrıntı ›</Text></View>
                  </TouchableOpacity>
                );
              })}
            </Card>

            {wallets.length > 1 ? (
              <><SectionHeader title="Cüzdanlar" /><Card>{wallets.map((wallet) => <Btn compact key={wallet.id} label={`${wallet.name}${wallet.watchOnly ? " · Watch-only" : ""}${engine?.meta.id === wallet.id ? "  ✓" : ""}`} kind={engine?.meta.id === wallet.id ? "primary" : "default"} onPress={() => openWallet(wallet)} />)}</Card></>
            ) : null}
            <Btn label="Yeni cüzdan ekle" kind="ghost" onPress={() => onAddWallet(profile)} />
          </>
        ) : null}

        {tab === "send" ? (
          <>
            <View style={styles.pageIntro}><Text style={styles.pageTitle}>Bitcoin gönder</Text><Text style={styles.pageSub}>Adres ve miktarı iki kez kontrol edin. Yayınlanan Bitcoin işlemi geri alınamaz.</Text></View>
            <Card>
              {engine?.meta.watchOnly ? <Text style={styles.emptySub}>Watch-only cüzdanda özel anahtar bulunmadığı için gönderim yapılamaz.</Text> : (
                <>
                  <Input label="ALICI ADRESİ VEYA BIP21" value={sendTo} onChangeText={applyPaymentInput} placeholder={APP_CONFIG.addressPlaceholder} autoCapitalize="none" autoCorrect={false} />
                  <Btn compact label="Panodan adres / BIP21 al" onPress={pastePaymentRequest} />
                  {paymentInputError ? <Text style={styles.warning}>{paymentInputError}</Text> : null}
                  {paymentRequestNote ? <Text style={styles.paymentNote}>Ödeme isteği · {paymentRequestNote}</Text> : null}
                  {phishWarning ? <Text style={styles.warning}>{phishWarning}</Text> : null}
                  {sendTo.length > 12 ? <View style={styles.addressPreview}><AddressText address={sendTo.trim()} /></View> : null}
                  <Input
                    label="MİKTAR (SATOSHI)"
                    value={sendAll ? "" : sendAmount}
                    onChangeText={(value) => { setSendAll(false); setSendAmount(value); }}
                    keyboardType="number-pad"
                    placeholder={sendAll ? "Ücret düşülerek hesaplanacak" : "10000"}
                    editable={!sendAll}
                    hint={sendAll ? "PSBT oluşturulduğunda gerçek harcanabilir tutar ve ücret gösterilir." : sendAmountHint}
                  />
                  <Btn
                    compact
                    label={sendAll ? "MAX seçildi ✓" : "Tüm onaylı bakiyeyi gönder (MAX)"}
                    kind={sendAll ? "primary" : "default"}
                    onPress={() => setSendAll((current) => !current)}
                    disabled={balance.confirmedSat <= 0}
                  />
                  <Text style={styles.fieldLabel}>AĞ ÜCRETİ · SAT/VB</Text>
                  {fees ? <View style={styles.feeRow}>
                    {([["Ekonomik", fees.slowSatVb], ["Normal", fees.normalSatVb], ["Hızlı", fees.fastSatVb]] as const).map(([label, rate]) => (
                      <TouchableOpacity key={label} style={[styles.feeChoice, feeRate === String(rate) && styles.feeChoiceActive]} onPress={() => setFeeRate(String(rate))}>
                        <Text style={[styles.feeLabel, feeRate === String(rate) && styles.feeLabelActive]}>{label}</Text><Text style={[styles.feeValue, feeRate === String(rate) && styles.feeLabelActive]}>{rate}</Text>
                      </TouchableOpacity>
                    ))}
                  </View> : null}
                  <Input value={feeRate} onChangeText={setFeeRate} keyboardType="number-pad" placeholder="sat/vB" />
                  <Btn label="İşlemi güvenli incele" kind="primary" onPress={prepareSend} busy={sending} disabled={!sendTo.trim() || (!sendAmount && !sendAll) || !!paymentInputError || (APP_CONFIG.isMainnet && !engine?.meta.backupVerified)} />
                  {APP_CONFIG.isMainnet && engine && !engine.meta.backupVerified ? <Text style={styles.warning}>Önce kurtarma ifadesi yedeğinizi doğrulayın.</Text> : null}
                </>
              )}
            </Card>
          </>
        ) : null}

        {tab === "settings" ? (
          <>
            <View style={styles.pageIntro}><Text style={styles.pageTitle}>Güvenlik ve ağ</Text><Text style={styles.pageSub}>Cüzdanın güvenlik durumu ve Bitcoin veri kaynağı.</Text></View>
            <Card title="Güvenlik durumu">
              <InfoRow label="Bitcoin ağı" value={APP_CONFIG.networkLabel} tone={APP_CONFIG.isMainnet ? "red" : "accent"} />
              <InfoRow label="Anahtar kasası" value={vaultLevel === "hardware" ? "Donanım destekli" : vaultLevel === "software" ? "Yazılım Keystore" : "Doğrulanamadı"} tone={vaultLevel === "hardware" ? "green" : "red"} />
              <InfoRow label="Ekran görüntüsü" value="Engellendi" tone="green" />
              <InfoRow label="Otomatik kilit" value="60 saniye" tone="green" />
              <InfoRow label="Yedek doğrulaması" value={engine?.meta.backupVerified ? "Tamamlandı" : "Eksik"} tone={engine?.meta.backupVerified ? "green" : "red"} />
              {vaultLevel !== "hardware" ? <Text style={styles.warning}>Bu cihaz donanım destekli anahtar korumasını doğrulamadı. Mainnet için küçük miktar kullanın.</Text> : null}
            </Card>

            <Card title="Bakiye görünümü" subtitle="Bitcoin miktarı kesin olarak satoshi cinsinden tutulur; USD karşılığı yalnızca yaklaşık piyasa değeridir.">
              <View style={styles.settingsChoiceRow}>
                {(["btc", "sat"] as const).map((unit) => (
                  <Btn
                    key={unit}
                    compact
                    label={unit.toUpperCase()}
                    kind={displayUnit === unit ? "primary" : "default"}
                    onPress={() => chooseDisplayUnit(unit)}
                  />
                ))}
              </View>
              <InfoRow label="Yaklaşık USD" value={usdBalance ?? "Kullanılamıyor"} tone={usdBalance ? "green" : undefined} />
              <InfoRow label="Fiyat kaynağı" value={fiatQuote ? `${fiatQuote.source}${fiatQuote.stale ? " · eski" : ""}` : "Bağlantı bekleniyor"} />
              <Btn compact label="BTC/USD fiyatını yenile" onPress={refreshPrice} busy={priceLoading} />
            </Card>

            {profile === "main" ? <Card title="Duress PIN" subtitle="İkinci PIN yalnızca ayrı oluşturduğunuz decoy cüzdanları açar; ana profil görünmez.">
              <Input value={duressPin} onChangeText={setDuressPin} placeholder="6–8 haneli farklı PIN" secureTextEntry keyboardType="number-pad" maxLength={8} />
              <Btn label="Duress PIN kaydet" onPress={saveDuress} disabled={duressPin.length < 6} />
              <Btn label="Decoy cüzdan ekle" kind="ghost" onPress={() => onAddWallet("duress")} />
            </Card> : null}

            <Card title="Esplora sunucuları" subtitle="Otomatik mod önce seçili sunucuyu dener; yalnızca hata halinde sıradaki doğrulanmış sunucuya geçer.">
              <View style={styles.settingsChoiceRow}>
                <Btn compact label="Otomatik fallback" kind={serverMode === "automatic" ? "primary" : "default"} onPress={() => chooseServerMode("automatic")} />
                <Btn compact label="Yalnız seçili" kind={serverMode === "manual" ? "primary" : "default"} onPress={() => chooseServerMode("manual")} />
              </View>
              {servers.map((server) => {
                const health = serverHealth[server.baseUrl];
                return (
                  <View key={server.baseUrl} style={[styles.serverRow, serverUrl === server.baseUrl && styles.serverRowActive]}>
                    <TouchableOpacity style={styles.serverSelect} onPress={() => saveServer(server.baseUrl)}>
                      <View style={styles.serverText}>
                        <Text style={styles.serverName}>{server.name}</Text>
                        <Text style={styles.serverUrl}>{server.baseUrl}</Text>
                        <Text style={[styles.serverStatus, health?.healthy ? styles.green : health ? styles.red : null]}>
                          {health?.healthy
                            ? `Sağlıklı · blok ${health.height} · ${health.latencyMs} ms`
                            : health
                              ? `Hata · ${health.error}`
                              : "Henüz kontrol edilmedi"}
                        </Text>
                      </View>
                      <View style={[styles.radio, serverUrl === server.baseUrl && styles.radioActive]}>{serverUrl === server.baseUrl ? <View style={styles.radioDot} /> : null}</View>
                    </TouchableOpacity>
                    {server.custom ? <TouchableOpacity onPress={() => removeCustomServer(server.baseUrl)}><Text style={styles.removeServer}>Kaldır</Text></TouchableOpacity> : null}
                  </View>
                );
              })}
              <Btn compact label="Tüm sunucuları doğrula" onPress={checkServers} busy={checkingServers} />
              <View style={styles.customServerBox}>
                <Input
                  label="KİŞİSEL ESPLORA · HTTPS"
                  value={customServerUrl}
                  onChangeText={setCustomServerUrl}
                  placeholder="https://node.example.com/api"
                  autoCapitalize="none"
                  autoCorrect={false}
                  hint="Eklenmeden önce genesis bloğu ve ağ yüksekliği doğrulanır."
                />
                <Btn compact label="Doğrula ve ekle" onPress={addCustomServer} busy={checkingServers} disabled={!customServerUrl.trim()} />
              </View>
              <Text style={styles.privacyHint}>Sunucular özel anahtarı göremez; ancak sorgulanan adresleri ve IP bağlantısını gözlemleyebilir. Kişisel node en iyi gizlilik seçeneğidir.</Text>
            </Card>
          </>
        ) : null}

        {msg ? <Text style={[styles.message, messageIsError && styles.messageError]}>{msg}</Text> : null}
      </ScrollView>

      <View style={styles.tabBar}>
        {([['wallet', '◈', 'Cüzdan'], ['send', '↗', 'Gönder'], ['settings', '⚙', 'Ayarlar']] as const).map(([key, icon, label]) => (
          <TouchableOpacity accessibilityRole="button" key={key} style={styles.tabBtn} onPress={() => setTab(key)}>
            <Text style={[styles.tabIcon, tab === key && styles.tabActive]}>{icon}</Text>
            <Text style={[styles.tabLabel, tab === key && styles.tabActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Modal visible={pendingSend !== null} transparent animationType="slide" onRequestClose={() => !sending && setPendingSend(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Badge label="SON KONTROL" tone="accent" />
            <Text style={styles.modalTitle}>İşlemi imzalayın</Text>
            <Text style={styles.modalSub}>Aşağıdaki değerler cihazınızda oluşturulan PSBT'den alınmıştır.</Text>
            <View style={styles.summaryBox}>
              <Text style={styles.modalLabel}>ALICI</Text>
              <AddressText address={pendingSend?.toAddress ?? ""} large />
              <View style={styles.summaryDivider} />
              <InfoRow label="Miktar" value={pendingSend ? formatBtc(pendingSend.amountSat, APP_CONFIG.ticker) : ""} />
              <InfoRow label="Ağ ücreti" value={pendingSend ? `${pendingSend.feeSat.toLocaleString("tr-TR")} sat · ${pendingSend.feeRateSatVb} sat/vB` : ""} tone={feeWarning ? "red" : undefined} />
              <InfoRow label="Toplam düşecek" value={pendingSend ? formatBtc(pendingSend.amountSat + pendingSend.feeSat, APP_CONFIG.ticker) : ""} tone="accent" />
              {pendingSend?.sendAll ? <InfoRow label="Gönderim türü" value="Tüm harcanabilir bakiye" tone="accent" /> : null}
            </View>
            {feeWarning ? <Text style={styles.warning}>Ağ ücreti gönderim miktarının %10'undan yüksek.</Text> : null}
            {phishWarning ? <Text style={styles.warning}>{phishWarning}</Text> : null}
            {APP_CONFIG.isMainnet ? <Input label={`ADRESİN SON 4 KARAKTERİ · ${expectedTail}`} value={confirmTail} onChangeText={setConfirmTail} autoCapitalize="none" autoCorrect={false} maxLength={4} placeholder="Son 4 karakter" hint="Panodan yapıştırmayın; ekrandaki alıcı adresinden okuyun." /> : null}
            {sendError ? <Text style={styles.warning}>{sendError}</Text> : null}
            <Btn label="İmzala ve Bitcoin ağına yayınla" kind="primary" onPress={confirmSend} busy={sending} disabled={APP_CONFIG.isMainnet && confirmTail.trim().toLowerCase() !== expectedTail.toLowerCase()} />
            <Btn label="Vazgeç" kind="ghost" onPress={() => { setPendingSend(null); setSendError(""); }} disabled={sending} />
          </View>
        </View>
      </Modal>

      <Modal visible={selectedTx !== null} transparent animationType="slide" onRequestClose={() => setSelectedTx(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Badge label={selectedTx?.confirmed ? "ONAYLANDI" : "MEMPOOL'DA"} tone={selectedTx?.confirmed ? "green" : "accent"} />
            <Text style={styles.modalTitle}>İşlem ayrıntıları</Text>
            <Text style={styles.modalSub}>Tutarlar yerel cüzdan verisinden, durum ise son Esplora senkronizasyonundan alınır.</Text>
            <View style={styles.summaryBox}>
              <Text style={styles.modalLabel}>TXID</Text>
              <Text selectable style={styles.txidFull}>{selectedTx?.txid}</Text>
              <View style={styles.summaryDivider} />
              <InfoRow
                label="Bakiye etkisi"
                value={`${selectedTxNet >= 0 ? "+" : ""}${formatBitcoin(selectedTxNet, displayUnit, APP_CONFIG.ticker)}`}
                tone={selectedTxNet >= 0 ? "green" : "red"}
              />
              <InfoRow label="Alınan" value={selectedTx ? formatBitcoin(selectedTx.receivedSat, displayUnit, APP_CONFIG.ticker) : ""} />
              <InfoRow label="Harcanan" value={selectedTx ? formatBitcoin(selectedTx.sentSat, displayUnit, APP_CONFIG.ticker) : ""} />
              <InfoRow label="Ağ ücreti" value={selectedTx?.feeSat !== undefined ? formatSat(selectedTx.feeSat) : "Bilinmiyor"} />
              <InfoRow
                label="Zaman"
                value={selectedTx?.timestamp ? new Date(selectedTx.timestamp * 1000).toLocaleString("tr-TR") : "Henüz blok zamanı yok"}
              />
            </View>
            <Btn
              label="Blok gezgininde doğrula"
              kind="primary"
              onPress={() => selectedTx && Linking.openURL(`${APP_CONFIG.txExplorerBase}${selectedTx.txid}`)}
            />
            <Btn
              label="TXID'yi kopyala"
              onPress={() => {
                if (!selectedTx) return;
                Clipboard.setString(selectedTx.txid);
                setMsg("TXID panoya kopyalandı.");
              }}
            />
            <Btn label="Kapat" kind="ghost" onPress={() => setSelectedTx(null)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scrollContent: { padding: spacing.m, paddingBottom: spacing.xl },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.m, paddingVertical: 12, borderBottomColor: colors.border, borderBottomWidth: 1 },
  brandLogo: { width: 42, height: 42, borderRadius: 14, marginRight: 11, backgroundColor: colors.black },
  headerText: { flex: 1 },
  eyebrow: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  walletName: { color: colors.text, fontSize: 17, fontWeight: "800", marginTop: 2 },
  balanceCard: { overflow: "hidden" },
  balanceTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  balanceLabel: { color: colors.sub, fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  syncDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  syncDotBusy: { backgroundColor: colors.accent },
  balance: { color: colors.text, fontSize: 33, lineHeight: 40, fontWeight: "900", letterSpacing: -1.2, marginTop: 13 },
  sats: { color: colors.sub, fontSize: 12, marginTop: 3 },
  usdBalance: { color: colors.green, fontSize: 15, fontWeight: "800", marginTop: 7 },
  unitRow: { flexDirection: "row", gap: 7, marginTop: spacing.m },
  unitPill: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 12, paddingVertical: 6 },
  unitPillActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  unitPillText: { color: colors.sub, fontSize: 10, fontWeight: "800" },
  unitPillTextActive: { color: colors.accent },
  balanceDivider: { height: 1, backgroundColor: colors.borderStrong, marginVertical: spacing.m },
  balanceStats: { flexDirection: "row", gap: spacing.l },
  stat: { flex: 1 },
  statLabel: { color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  statValue: { color: colors.text, fontSize: 12, fontWeight: "700", marginTop: 5 },
  quickRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: spacing.l, paddingHorizontal: spacing.s },
  quickAction: { alignItems: "center", width: "31%" },
  quickIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: colors.accentSoft, borderColor: "#4A3515", borderWidth: 1, alignItems: "center", justifyContent: "center" },
  quickIconText: { color: colors.accent, fontSize: 23, fontWeight: "700" },
  quickLabel: { color: colors.sub, fontSize: 11, fontWeight: "700", marginTop: 8 },
  copyHint: { color: colors.muted, fontSize: 11, marginTop: spacing.s },
  addressMetaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.m, paddingTop: spacing.s, borderTopColor: colors.border, borderTopWidth: 1 },
  addressMeta: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  qrWrap: { alignSelf: "center", backgroundColor: "#FFFFFF", borderRadius: radius.m, padding: 14, marginBottom: spacing.l },
  privacyHint: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: spacing.s },
  empty: { alignItems: "center", paddingVertical: spacing.l },
  emptyIcon: { color: colors.muted, fontSize: 28 },
  emptyTitle: { color: colors.text, fontWeight: "800", marginTop: spacing.s },
  emptySub: { color: colors.sub, textAlign: "center", fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  txRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomColor: colors.border, borderBottomWidth: 1 },
  txRowLast: { borderBottomWidth: 0 },
  txIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: 11 },
  txIconIn: { backgroundColor: colors.greenSoft },
  txIconOut: { backgroundColor: colors.redSoft },
  txMeta: { flex: 1 },
  txTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  txId: { color: colors.muted, fontFamily: "monospace", fontSize: 10, marginTop: 3 },
  txRight: { alignItems: "flex-end", maxWidth: "46%" },
  txAmount: { fontSize: 12, fontWeight: "800" },
  txStatus: { fontSize: 10, marginTop: 4, fontWeight: "700" },
  pageIntro: { paddingVertical: spacing.m },
  pageTitle: { color: colors.text, fontSize: 29, fontWeight: "900", letterSpacing: -0.8 },
  pageSub: { color: colors.sub, fontSize: 13, lineHeight: 20, marginTop: spacing.s },
  addressPreview: { backgroundColor: colors.inputBg, borderRadius: radius.m, padding: 12, marginVertical: spacing.xs },
  paymentNote: { color: colors.green, backgroundColor: colors.greenSoft, borderRadius: radius.m, padding: 11, fontSize: 12, lineHeight: 18, marginTop: spacing.s },
  fieldLabel: { color: colors.sub, fontSize: 12, fontWeight: "700", marginTop: spacing.m, marginBottom: spacing.s },
  feeRow: { flexDirection: "row", gap: spacing.s },
  feeChoice: { flex: 1, backgroundColor: colors.inputBg, borderColor: colors.border, borderWidth: 1, borderRadius: radius.m, paddingVertical: 12, alignItems: "center" },
  feeChoiceActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  feeLabel: { color: colors.sub, fontSize: 10, fontWeight: "700" },
  feeLabelActive: { color: colors.accent },
  feeValue: { color: colors.text, fontSize: 17, fontWeight: "800", marginTop: 3 },
  warning: { color: colors.red, backgroundColor: colors.redSoft, borderRadius: radius.m, padding: 11, fontSize: 12, lineHeight: 18, marginTop: spacing.s },
  settingsChoiceRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.s, marginBottom: spacing.s },
  serverRow: { backgroundColor: colors.inputBg, borderRadius: radius.m, borderWidth: 1, borderColor: colors.border, padding: 13, marginTop: spacing.s },
  serverRowActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  serverSelect: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  serverText: { flex: 1, paddingRight: spacing.s },
  serverName: { color: colors.text, fontSize: 14, fontWeight: "800" },
  serverUrl: { color: colors.muted, fontSize: 9, marginTop: 4, maxWidth: 270 },
  serverStatus: { color: colors.muted, fontSize: 10, fontWeight: "700", marginTop: 7 },
  removeServer: { color: colors.red, fontSize: 11, fontWeight: "800", marginTop: spacing.s, alignSelf: "flex-end" },
  customServerBox: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: spacing.m, paddingTop: spacing.s },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: colors.accent },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent },
  message: { color: colors.green, backgroundColor: colors.greenSoft, borderRadius: radius.m, padding: 12, lineHeight: 19, marginBottom: spacing.m },
  messageError: { color: colors.red, backgroundColor: colors.redSoft },
  tabBar: { flexDirection: "row", backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, paddingBottom: 6, paddingTop: 5 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 6 },
  tabIcon: { color: colors.muted, fontSize: 20, lineHeight: 23 },
  tabLabel: { color: colors.muted, fontSize: 10, fontWeight: "700", marginTop: 2 },
  tabActive: { color: colors.accent },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  modalCard: { maxHeight: "94%", backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderColor: colors.borderStrong, borderWidth: 1, padding: spacing.l, paddingBottom: spacing.xl },
  modalHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: spacing.l },
  modalTitle: { color: colors.text, fontSize: 27, fontWeight: "900", letterSpacing: -0.6, marginTop: spacing.s },
  modalSub: { color: colors.sub, fontSize: 12, lineHeight: 18, marginTop: spacing.xs, marginBottom: spacing.m },
  summaryBox: { backgroundColor: colors.inputBg, borderRadius: radius.l, borderColor: colors.border, borderWidth: 1, padding: spacing.m },
  modalLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.8, marginBottom: spacing.s },
  summaryDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.m },
  txidFull: { color: colors.text, fontFamily: "monospace", fontSize: 11, lineHeight: 18 },
  green: { color: colors.green },
  red: { color: colors.red },
  accent: { color: colors.accent },
});
