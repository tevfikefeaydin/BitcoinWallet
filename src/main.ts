import "./style.css";
import { WalletService, type TxSummary, type WalletAddressType } from "./wallet";

const svc = new WalletService();
const app = document.querySelector<HTMLDivElement>("#app")!;

function fmtBtc(sat: bigint): string {
  const sign = sat < 0n ? "-" : "";
  const abs = sat < 0n ? -sat : sat;
  const whole = abs / 100_000_000n;
  const frac = (abs % 100_000_000n).toString().padStart(8, "0");
  return `${sign}${whole}.${frac} tBTC`;
}

function short(txid: string): string {
  return `${txid.slice(0, 10)}…${txid.slice(-10)}`;
}

// ---------- Onboarding ekranı ----------
function renderOnboarding(): void {
  app.innerHTML = `
    <header><h1>₿ BTC Wallet</h1><span class="badge">TESTNET</span></header>
    <div class="card">
      <h2>Cüzdan Oluştur</h2>
      <p>Yeni bir 12 kelimelik kurtarma ifadesi üretilir. Bu prototip <b>testnet</b> üzerinde çalışır — gerçek para içermez.</p>
      <div class="radio-row">
        <label class="radio"><input type="radio" name="addrtype" value="p2tr" checked /> Taproot <span class="sub">(tb1p… — önerilen)</span></label>
        <label class="radio"><input type="radio" name="addrtype" value="p2wpkh" /> SegWit <span class="sub">(tb1q…)</span></label>
      </div>
      <label>Şifreleme parolası <input id="vault-pass" type="password" minlength="8" autocomplete="new-password" placeholder="En az 8 karakter" /></label>
      <label>Parola (tekrar) <input id="vault-pass2" type="password" minlength="8" autocomplete="new-password" /></label>
      <button id="btn-create" class="primary">Yeni Cüzdan Oluştur</button>
    </div>
    <div class="card">
      <h2>Cüzdan Geri Yükle</h2>
      <textarea id="restore-input" rows="2" placeholder="12 kelimelik kurtarma ifadenizi girin..."></textarea>
      <button id="btn-restore">Geri Yükle</button>
    </div>
    <p id="msg" class="msg"></p>`;

  const selectedType = (): WalletAddressType =>
    (document.querySelector<HTMLInputElement>('input[name="addrtype"]:checked')?.value as WalletAddressType) ?? "p2tr";

  const passphrase = (): string => {
    const first = document.querySelector<HTMLInputElement>("#vault-pass")!.value;
    const second = document.querySelector<HTMLInputElement>("#vault-pass2")!.value;
    if (first.length < 8) throw new Error("Şifreleme parolası en az 8 karakter olmalı.");
    if (first !== second) throw new Error("Parolalar eşleşmiyor.");
    return first;
  };

  document.querySelector("#btn-create")!.addEventListener("click", async () => {
    try {
      setBusy("#btn-create", true);
      const mnemonic = await svc.createNew(selectedType(), passphrase());
      renderSeedBackup(mnemonic);
    } catch (e) {
      showMsg((e as Error).message, true);
    } finally {
      setBusy("#btn-create", false);
    }
  });

  document.querySelector("#btn-restore")!.addEventListener("click", async () => {
    const input = document.querySelector<HTMLTextAreaElement>("#restore-input")!;
    try {
      await svc.restore(input.value, selectedType(), passphrase());
      await renderMain();
    } catch (e) {
      showMsg((e as Error).message, true);
    }
  });
}

function renderSeedBackup(mnemonic: string): void {
  const words = mnemonic
    .split(" ")
    .map((w, i) => `<span class="word"><i>${i + 1}</i>${w}</span>`)
    .join("");
  app.innerHTML = `
    <header><h1>₿ BTC Wallet</h1><span class="badge">TESTNET</span></header>
    <div class="card">
      <h2>Kurtarma İfadeniz</h2>
      <p>Bu 12 kelimeyi güvenli bir yere yazın. Cüzdanınıza erişimin tek yolu budur.</p>
      <div class="words">${words}</div>
      <button id="btn-done" class="primary">Yazdım, Devam Et</button>
    </div>`;
  document.querySelector("#btn-done")!.addEventListener("click", () => renderMain());
}

function renderUnlock(): void {
  const migration = svc.needsMigration
    ? "Eski düz metin kayıt bulundu. Belirleyeceğiniz parola ile şimdi şifrelenecek."
    : "Cüzdan verisini çözmek için şifreleme parolanızı girin.";
  app.innerHTML = `
    <header><h1>₿ BTC Wallet</h1><span class="badge">TESTNET</span></header>
    <div class="card">
      <h2>Cüzdan Kilitli</h2>
      <p>${migration}</p>
      <label>Şifreleme parolası <input id="unlock-pass" type="password" autocomplete="current-password" /></label>
      ${svc.needsMigration ? '<label>Parola (tekrar) <input id="unlock-pass2" type="password" autocomplete="new-password" /></label>' : ""}
      <button id="btn-unlock" class="primary">Kilidi Aç</button>
    </div>
    <p id="msg" class="msg"></p>`;
  document.querySelector("#btn-unlock")!.addEventListener("click", async () => {
    try {
      setBusy("#btn-unlock", true);
      const passphrase = document.querySelector<HTMLInputElement>("#unlock-pass")!.value;
      if (svc.needsMigration) {
        const repeat = document.querySelector<HTMLInputElement>("#unlock-pass2")!.value;
        if (passphrase.length < 8) throw new Error("Şifreleme parolası en az 8 karakter olmalı.");
        if (passphrase !== repeat) throw new Error("Parolalar eşleşmiyor.");
      }
      await svc.loadExisting(passphrase);
      await renderMain();
    } catch (e) {
      showMsg((e as Error).message, true);
    } finally {
      setBusy("#btn-unlock", false);
    }
  });
}

// ---------- Ana ekran ----------
async function renderMain(): Promise<void> {
  app.innerHTML = `
    <header>
      <h1>₿ BTC Wallet</h1><span class="badge">TESTNET</span>
      <span class="badge type">${svc.addressType === "p2tr" ? "TAPROOT" : "SEGWIT"}</span>
      <button id="btn-forget" class="danger small" title="Cüzdanı bu tarayıcıdan sil">Cüzdanı Unut</button>
    </header>

    <div class="card balance-card">
      <div class="balance" id="balance">— tBTC</div>
      <div class="sub" id="balance-sub"></div>
      <button id="btn-sync">🔄 Senkronize Et</button>
      <span id="sync-status" class="sub"></span>
    </div>

    <div class="card">
      <h2>Al</h2>
      <div class="addr-row">
        <code id="address">—</code>
        <button id="btn-copy" class="small">Kopyala</button>
        <button id="btn-new-addr" class="small">Yeni Adres</button>
      </div>
      <p class="sub">Testnet coin için bir faucet kullanın (ör. mempool.space/testnet faucet listesi).</p>
    </div>

    <div class="card">
      <h2>Gönder</h2>
      <label>Alıcı adresi <input id="send-to" placeholder="tb1q..." /></label>
      <label>Miktar (satoshi) <input id="send-amount" type="number" min="546" placeholder="10000" /></label>
      <label>Ücret
        <div class="fee-row" id="fee-row">
          <button class="fee-opt" data-fee="" id="fee-slow">🐢 Yavaş<br /><span class="sub">~1 gün</span></button>
          <button class="fee-opt selected" data-fee="" id="fee-normal">⏱ Normal<br /><span class="sub">~1 saat</span></button>
          <button class="fee-opt" data-fee="" id="fee-fast">⚡ Hızlı<br /><span class="sub">~10 dk</span></button>
        </div>
        <input id="send-fee" type="number" min="1" value="1" title="sat/vB (elle de girebilirsiniz)" />
      </label>
      <button id="btn-send" class="primary">Gönder</button>
    </div>

    <div class="card">
      <h2>İşlem Geçmişi</h2>
      <div id="txs"><p class="sub">Henüz senkronize edilmedi.</p></div>
    </div>
    <p id="msg" class="msg"></p>`;

  document.querySelector("#address")!.textContent = svc.receiveAddress();

  document.querySelector("#btn-copy")!.addEventListener("click", () => {
    navigator.clipboard.writeText(document.querySelector("#address")!.textContent ?? "");
    showMsg("Adres kopyalandı.");
  });

  document.querySelector("#btn-new-addr")!.addEventListener("click", () => {
    document.querySelector("#address")!.textContent = svc.newAddress();
  });

  document.querySelector("#btn-sync")!.addEventListener("click", () => doSync());

  document.querySelector("#btn-send")!.addEventListener("click", async () => {
    const to = document.querySelector<HTMLInputElement>("#send-to")!.value;
    const amount = document.querySelector<HTMLInputElement>("#send-amount")!.value;
    const fee = document.querySelector<HTMLInputElement>("#send-fee")!.value;
    if (!to || !amount) return showMsg("Adres ve miktar gerekli.", true);
    try {
      const amountSat = BigInt(amount);
      const feeRate = BigInt(fee || "1");
      if (amountSat <= 0n || feeRate <= 0n) throw new Error("Miktar ve ücret pozitif olmalı.");
      if (!confirm(`İşlemi onaylıyor musunuz?\n\nAlıcı: ${to.trim()}\nMiktar: ${amountSat} sat\nÜcret oranı: ${feeRate} sat/vB`)) return;
      setBusy("#btn-send", true);
      const txid = await svc.send(to, amountSat, feeRate);
      showMsg(`Gönderildi! txid: ${short(txid)}`);
      await doSync();
    } catch (e) {
      showMsg(`Gönderim hatası: ${(e as Error).message ?? e}`, true);
    } finally {
      setBusy("#btn-send", false);
    }
  });

  document.querySelectorAll<HTMLButtonElement>(".fee-opt").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const fee = btn.dataset.fee;
      if (!fee) return;
      document.querySelector<HTMLInputElement>("#send-fee")!.value = fee;
      document.querySelectorAll(".fee-opt").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });

  document.querySelector("#btn-forget")!.addEventListener("click", () => {
    if (confirm("Cüzdan bu tarayıcıdan silinecek. Kurtarma ifadeniz yoksa erişim kaybolur. Emin misiniz?")) {
      svc.forget();
      location.reload();
    }
  });

  await doSync();
}

async function doSync(): Promise<void> {
  const status = document.querySelector("#sync-status");
  if (status) status.textContent = " senkronize ediliyor...";
  try {
    await svc.sync();
    refreshBalanceAndTxs();
    await refreshFees();
    if (status) status.textContent = ` son: ${new Date().toLocaleTimeString("tr-TR")}`;
  } catch (e) {
    if (status) status.textContent = " hata!";
    showMsg(`Senkronizasyon hatası: ${(e as Error).message ?? e}`, true);
  }
}

async function refreshFees(): Promise<void> {
  try {
    const fees = await svc.feeEstimates();
    const set = (sel: string, satVb: number, label: string) => {
      const btn = document.querySelector<HTMLButtonElement>(sel);
      if (!btn) return;
      btn.dataset.fee = String(satVb);
      btn.innerHTML = `${label}<br /><span class="sub">${satVb} sat/vB</span>`;
    };
    set("#fee-slow", fees.slowSatVb, "🐢 Yavaş");
    set("#fee-normal", fees.normalSatVb, "⏱ Normal");
    set("#fee-fast", fees.fastSatVb, "⚡ Hızlı");
    const selected = document.querySelector<HTMLButtonElement>(".fee-opt.selected");
    if (selected?.dataset.fee) {
      document.querySelector<HTMLInputElement>("#send-fee")!.value = selected.dataset.fee;
    }
  } catch {
    // ücret tahmini alınamazsa elle giriş devrede kalır
  }
}

function refreshBalanceAndTxs(): void {
  const b = svc.balance;
  document.querySelector("#balance")!.textContent = fmtBtc(b.totalSat);
  document.querySelector("#balance-sub")!.textContent =
    `onaylı: ${fmtBtc(b.confirmedSat)} · bekleyen: ${fmtBtc(b.pendingSat)}`;

  const txs = svc.transactions();
  const el = document.querySelector("#txs")!;
  if (txs.length === 0) {
    el.innerHTML = `<p class="sub">İşlem yok. Faucet'ten testnet coin isteyip tekrar senkronize edin.</p>`;
    return;
  }
  el.innerHTML = txs.map(txRow).join("");
}

function txRow(tx: TxSummary): string {
  const net = tx.receivedSat - tx.sentSat;
  const dir = net >= 0n ? "in" : "out";
  const badge = tx.confirmed ? `<span class="ok">onaylı</span>` : `<span class="pending">bekliyor</span>`;
  const fee = tx.feeSat !== null ? ` · ücret ${tx.feeSat} sat` : "";
  return `<div class="tx ${dir}">
    <a href="https://mempool.space/testnet/tx/${tx.txid}" target="_blank" rel="noopener">${short(tx.txid)}</a>
    <span class="amount">${net >= 0n ? "+" : ""}${fmtBtc(net)}</span>
    ${badge}<span class="sub">${fee}</span>
  </div>`;
}

function showMsg(text: string, isError = false): void {
  const el = document.querySelector("#msg");
  if (!el) return;
  el.textContent = text;
  el.className = `msg ${isError ? "error" : "info"}`;
}

function setBusy(sel: string, busy: boolean): void {
  const btn = document.querySelector<HTMLButtonElement>(sel);
  if (btn) btn.disabled = busy;
}

// ---------- Başlangıç ----------
if (svc.exists) {
  renderUnlock();
} else {
  renderOnboarding();
}
