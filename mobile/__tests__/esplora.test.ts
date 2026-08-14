import { checkEsploraServer, normalizeEsploraUrl } from "../src/core/EsploraService";

const TESTNET_GENESIS = "000000000933ea01ad0ee984209779baaaec3ced90fa3f408719526f8d77f4943";

function textResponse(value: string, ok = true, status = 200) {
  return { ok, status, text: async () => value } as Response;
}

describe("custom Esplora URL validation", () => {
  test("normalizes a secure endpoint", () => {
    expect(normalizeEsploraUrl(" https://node.example.com/api/ ")).toBe("https://node.example.com/api");
  });

  test("rejects cleartext and credential-bearing endpoints", () => {
    expect(() => normalizeEsploraUrl("http://node.example.com/api")).toThrow("HTTPS");
    expect(() => normalizeEsploraUrl("https://user:pass@node.example.com/api")).toThrow("kullanıcı");
  });

  test("rejects query strings, fragments and malformed URLs", () => {
    expect(() => normalizeEsploraUrl("https://node.example.com/api?token=secret")).toThrow("sorgu");
    expect(() => normalizeEsploraUrl("https://node.example.com/api#fragment")).toThrow("parça");
    expect(() => normalizeEsploraUrl("not a url")).toThrow("Geçerli");
  });

  test("accepts only the expected Bitcoin network identity and a valid height", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(textResponse(TESTNET_GENESIS))
      .mockResolvedValueOnce(textResponse("3000000"));

    const health = await checkEsploraServer(
      { name: "Test", baseUrl: "https://healthy.example.com/api", custom: true },
      true,
    );
    expect(health).toMatchObject({ healthy: true, height: 3_000_000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
  });

  test("fails closed for a wrong genesis or invalid chain height", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(textResponse("wrong-genesis"))
      .mockResolvedValueOnce(textResponse("not-a-height"));

    const health = await checkEsploraServer(
      { name: "Malicious", baseUrl: "https://malicious.example.com/api", custom: true },
      true,
    );
    expect(health.healthy).toBe(false);
    expect(health.error).toContain("ağ kimliği eşleşmedi");
    fetchMock.mockRestore();
  });
});
