import {
  btcAmountToSats,
  buildBitcoinPaymentUri,
  parseBitcoinPayment,
  satsToBtcAmount,
} from "../src/core/bitcoinUri";

describe("BIP21 Bitcoin payment requests", () => {
  const address = "bc1pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";

  test("keeps plain addresses unchanged", () => {
    expect(parseBitcoinPayment(`  ${address}  `)).toEqual({ address, isUri: false });
  });

  test("parses BTC amounts as exact integer satoshis", () => {
    expect(btcAmountToSats("1.00000001")).toBe(100_000_001);
    expect(btcAmountToSats("0.00000001")).toBe(1);
    expect(satsToBtcAmount(123_456_789)).toBe("1.23456789");
  });

  test("round-trips address, amount and metadata", () => {
    const uri = buildBitcoinPaymentUri(address, 125_000, "Kahve", "Teşekkürler");
    expect(parseBitcoinPayment(uri)).toEqual({
      address,
      amountSat: 125_000,
      label: "Kahve",
      message: "Teşekkürler",
      isUri: true,
    });
  });

  test("rejects ambiguous or unsupported requests", () => {
    expect(() => btcAmountToSats("0.000000001")).toThrow("8 ondalık");
    expect(() => parseBitcoinPayment(`${buildBitcoinPaymentUri(address, 1)}&amount=2`)).toThrow("birden fazla");
    expect(() => parseBitcoinPayment(`bitcoin:${address}?req-unknown=1`)).toThrow("zorunlu");
  });
});
