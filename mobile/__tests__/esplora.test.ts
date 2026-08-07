import { normalizeEsploraUrl } from "../src/core/EsploraService";

describe("custom Esplora URL validation", () => {
  test("normalizes a secure endpoint", () => {
    expect(normalizeEsploraUrl(" https://node.example.com/api/ ")).toBe("https://node.example.com/api");
  });

  test("rejects cleartext and credential-bearing endpoints", () => {
    expect(() => normalizeEsploraUrl("http://node.example.com/api")).toThrow("HTTPS");
    expect(() => normalizeEsploraUrl("https://user:pass@node.example.com/api")).toThrow("kullanıcı");
  });
});
