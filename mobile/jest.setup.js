jest.mock('react-native-get-random-values', () => ({}));

// BDK 1.0 bir TurboModule'dür; birim testlerinde native binary bulunmadığı için
// yalnızca başlatma ve yapılandırmada gereken yüzeyi taklit ederiz.
jest.mock('bdk-rn', () => ({
  uniffiInitAsync: jest.fn(async () => undefined),
  Network: { Bitcoin: 0, Testnet: 1, Testnet4: 2, Signet: 3, Regtest: 4 },
  NetworkKind: { Main: 0, Test: 1 },
  KeychainKind: { External: 0, Internal: 1 },
  WordCount: { Words12: 0, Words15: 1, Words18: 2, Words21: 3, Words24: 4 },
  ChainPosition: {
    Confirmed: { instanceOf: jest.fn(() => false) },
    Unconfirmed: { instanceOf: jest.fn(() => true) },
  },
  Address: jest.fn(),
  Amount: { fromSat: jest.fn() },
  Descriptor: jest.fn(),
  DescriptorSecretKey: jest.fn(),
  EsploraClient: jest.fn(),
  FeeRate: { fromSatPerVb: jest.fn() },
  Mnemonic: jest.fn(),
  Persister: { newSqlite: jest.fn(), newInMemory: jest.fn() },
  TxBuilder: jest.fn(),
  Wallet: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest').default,
);

jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
  getString: jest.fn(async () => ''),
}));

jest.mock('react-native-qrcode-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function MockQrCode() {
    return React.createElement(View, { testID: 'payment-qr' });
  };
});

jest.mock('react-native-keychain', () => {
  const secrets = new Map();
  return {
    ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' },
    SECURITY_LEVEL: { SECURE_HARDWARE: 'SECURE_HARDWARE', SECURE_SOFTWARE: 'SECURE_SOFTWARE', ANY: 'ANY' },
    setGenericPassword: jest.fn(async (username, password, options) => {
      secrets.set(options.service, { username, password });
      return true;
    }),
    getGenericPassword: jest.fn(async (options) => secrets.get(options.service) ?? false),
    resetGenericPassword: jest.fn(async (options) => secrets.delete(options.service)),
    getSecurityLevel: jest.fn(async () => 'SECURE_HARDWARE'),
  };
});

const { NativeModules } = require('react-native');
NativeModules.Kdf = {
  bitcoinNetwork: 'testnet',
  getWalletDatabasePath: jest.fn(async (walletId) => `/test/${walletId}.sqlite`),
  pbkdf2Sha256: jest.fn(async (password, saltHex, iterations, dkLenBytes) => {
    const value = `${password}|${saltHex}|${iterations}|${dkLenBytes}`;
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) % 4294967295;
    return Math.floor(hash).toString(16).padStart(8, '0').repeat(8);
  }),
};
/* eslint-env jest */
