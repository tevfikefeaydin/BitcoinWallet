import { formatBitcoin, formatBtc, formatUsd } from "../src/core/format";

describe("bitcoin amount formatting", () => {
  test("formats satoshis as exact BTC without floating point rounding", () => {
    expect(formatBtc(123_456_789)).toBe("1.23456789 BTC");
    expect(formatBtc(-1_234, "BTC", true)).toBe("-0.00001234 BTC");
  });

  test("switches between BTC and SAT display units", () => {
    expect(formatBitcoin(100_000_000, "btc")).toBe("1.00 BTC");
    expect(formatBitcoin(100_000_000, "sat")).toContain("100");
    expect(formatBitcoin(100_000_000, "sat")).toContain("SAT");
  });

  test("keeps fiat display approximate and separate from wallet accounting", () => {
    expect(formatUsd(50_000_000, 100_000)).toBe("$50,000.00");
    expect(formatUsd(1, undefined)).toBeNull();
  });
});
