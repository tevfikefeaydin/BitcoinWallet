/* eslint-env jest */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules, Platform } from "react-native";
import { reconcileInstallState } from "../src/core/InstallState";
import { SecureVault } from "../src/core/SecureVault";
import { WalletStore } from "../src/core/WalletStore";
import type { WalletMeta } from "../src/core/types";

const freshInstall = NativeModules.Kdf.consumeFreshInstallFlag as jest.Mock;

function wallet(id: string): WalletMeta {
  return { id, name: id, addressKind: "taproot", watchOnly: false, profile: "main", createdAt: 1, network: "testnet" };
}

async function resetState() {
  await AsyncStorage.clear();
  for (const service of await SecureVault.listServices()) await SecureVault.deleteService(service);
  freshInstall.mockReset();
  freshInstall.mockResolvedValue(false);
}

describe("reconcileInstallState (iOS)", () => {
  const originalOs = Platform.OS;
  beforeEach(async () => {
    Platform.OS = "ios";
    await resetState();
  });
  afterAll(() => {
    Platform.OS = originalOs;
  });

  test("yeniden kurulumda önceki kurulumdan kalan sırları siler", async () => {
    await SecureVault.savePinRecord("{}");
    await SecureVault.saveMnemonic("old", "eski kelimeler");
    freshInstall.mockResolvedValue(true);

    await reconcileInstallState();

    expect(await SecureVault.getPinRecord()).toBeNull();
    expect(await SecureVault.getMnemonic("old")).toBeNull();
  });

  test("ilk açılış bayrağı yoksa metadata kaybolsa bile sırlara dokunmaz", async () => {
    await SecureVault.savePinRecord("{}");
    await SecureVault.saveMnemonic("w1", "kelimeler");

    await reconcileInstallState();

    expect(await SecureVault.getPinRecord()).toBe("{}");
    expect(await SecureVault.getMnemonic("w1")).toBe("kelimeler");
  });

  test("ilk açılışta kayıtlı cüzdan varsa hiçbir sırrı silmez", async () => {
    await WalletStore.add(wallet("w1"));
    await SecureVault.savePinRecord("{}");
    await SecureVault.saveMnemonic("w1", "kelimeler");
    freshInstall.mockResolvedValue(true);

    await reconcileInstallState();

    expect(await SecureVault.getMnemonic("w1")).toBe("kelimeler");
    expect((await WalletStore.list()).map((w) => w.id)).toEqual(["w1"]);
  });

  test("yedekten geri yüklemede sırrı olmayan cüzdan kayıtlarını kaldırır", async () => {
    await WalletStore.add(wallet("ghost"));
    await WalletStore.add(wallet("kept"));
    await SecureVault.saveMnemonic("kept", "kelimeler");

    await reconcileInstallState();

    expect((await WalletStore.list()).map((w) => w.id)).toEqual(["kept"]);
  });

  test("PIN kaydı varken eksik sır metadata silmeye yol açmaz", async () => {
    await WalletStore.add(wallet("w1"));
    await SecureVault.savePinRecord("{}");

    await reconcileInstallState();

    expect((await WalletStore.list()).map((w) => w.id)).toEqual(["w1"]);
  });

  test("Android'de hiçbir şey yapmaz", async () => {
    Platform.OS = "android";
    await SecureVault.saveMnemonic("old", "eski kelimeler");
    freshInstall.mockResolvedValue(true);

    await reconcileInstallState();

    expect(freshInstall).not.toHaveBeenCalled();
    expect(await SecureVault.getMnemonic("old")).toBe("eski kelimeler");
  });
});
