import AsyncStorage from '@react-native-async-storage/async-storage';
import { findPoisoningSuspects, isPoisoningSuspect } from '../src/core/antiPhishing';
import { PinManager } from '../src/core/PinManager';
import { SecureVault } from '../src/core/SecureVault';
import { WalletStore } from '../src/core/WalletStore';

describe('security controls', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await SecureVault.deletePinRecord();
  });

  test('locks after five failed PIN attempts and accepts the correct PIN before lockout', async () => {
    await PinManager.setPin('123456');
    expect(await PinManager.verify('123456')).toBe('main');
    for (let i = 0; i < 5; i++) expect(await PinManager.verify('000000')).toBeNull();
    expect(await PinManager.verify('123456')).toBe('locked');
  });

  test('resets a permanent lock only with a matching recovery phrase', async () => {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    await WalletStore.add({
      id: 'wallet-1',
      name: 'Test',
      addressKind: 'segwit',
      watchOnly: false,
      profile: 'main',
      createdAt: 1,
    });
    await SecureVault.saveMnemonic('wallet-1', mnemonic);
    await PinManager.setPin('123456');
    for (let i = 0; i < 5; i++) await PinManager.verify('000000');

    expect(await PinManager.recoverWithMnemonic('wrong words', '654321')).toBe(false);
    expect(await PinManager.recoverWithMnemonic(mnemonic, '654321')).toBe(true);
    expect(await PinManager.verify('654321')).toBe('main');
  });

  test('detects lookalike recipient addresses but not exact matches', () => {
    const known = 'tb1qabcdefghijklmno123456';
    const poisoned = 'tb1qabcdefghZZZZZZZZ123456';
    expect(isPoisoningSuspect(known, known)).toBe(false);
    expect(findPoisoningSuspects(poisoned, [known])).toEqual([known]);
  });

  test('defaults to automatic Esplora fallback and persists the chosen balance unit', async () => {
    expect(await WalletStore.getEsploraMode()).toBe('automatic');
    await WalletStore.setEsploraMode('manual');
    expect(await WalletStore.getEsploraMode()).toBe('manual');
    expect(await WalletStore.getBalanceUnit()).toBe('btc');
    await WalletStore.setBalanceUnit('sat');
    expect(await WalletStore.getBalanceUnit()).toBe('sat');
  });
});
