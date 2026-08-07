// Anti-phishing yardımcıları (Unstoppable Wallet'taki address-poisoning korumasından uyarlandı).
// Address poisoning: saldırgan, kullanıcının geçmişindeki adreslere ilk/son karakterleri
// benzeyen adresler üretip geçmişi zehirler; kullanıcı yanlış adresi kopyalar.

/** İki adres "tehlikeli derecede benzer" mi? (aynı değil ama baş/son eşleşiyor) */
export function isPoisoningSuspect(candidate: string, known: string): boolean {
  if (candidate === known) return false;
  if (candidate.length < 12 || known.length < 12) return false;
  const headLen = 8;
  const tailLen = 6;
  return (
    candidate.slice(0, headLen) === known.slice(0, headLen) &&
    candidate.slice(-tailLen) === known.slice(-tailLen)
  );
}

export function findPoisoningSuspects(candidate: string, knownList: string[]): string[] {
  return knownList.filter((k) => isPoisoningSuspect(candidate, k));
}

/** Adresi baş/orta/son olarak böler — UI vurgulu gösterim için. */
export function splitForDisplay(address: string): { head: string; middle: string; tail: string } {
  if (address.length <= 16) return { head: address, middle: "", tail: "" };
  return {
    head: address.slice(0, 8),
    middle: address.slice(8, -6),
    tail: address.slice(-6),
  };
}
