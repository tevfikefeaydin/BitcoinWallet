# BitcoinWallet

[![CI](https://github.com/tevfikefeaydin/BitcoinWallet/actions/workflows/ci.yml/badge.svg)](https://github.com/tevfikefeaydin/BitcoinWallet/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Self-custody Bitcoin wallet project. The primary deliverable is the React Native Android app in [`mobile/`](mobile/); the repository root also contains the companion Vite web prototype.

## Android mainnet release

The tested ARM64 APK is published under [GitHub Releases](https://github.com/tevfikefeaydin/BitcoinWallet/releases/tag/v0.3.0).

- Package: `com.btcwalletmobile.mainnet`
- Version: `0.3.0-mainnet` (`versionCode 4`)
- APK SHA-256: `2F576466710AAEB3BCA7EA91FC424709E5B7A023AA9AF59541C7A4EEE5D11273`
- ABI: `arm64-v8a`

## Highlights

- BIP86 Taproot and BIP84 SegWit wallets powered by official BDK-RN 1.0
- Local mnemonic custody, Android Keystore protection and PBKDF2 PIN derivation
- Mandatory 12-word backup verification before mainnet sending
- Exact BTC/SAT accounting with display-only USD estimates
- Mainnet-verified Esplora health checks, automatic fallback and custom HTTPS endpoints
- Controlled receive-address rotation with derivation index and unused-address cap
- BIP21 payment requests with on-screen QR codes and strict URI parsing on paste
- Send-max drain transactions with the real spendable amount resolved from the PSBT
- Transaction detail sheet with local amounts, fee, timestamp and explorer verification
- Screenshot/overlay protections, recipient-tail confirmation, RBF and fee limits

## Validation

Requires Node.js 22.11+, JDK 17, the Android SDK and Git. Yarn must be installed before the first install: `bdk-rn` pulls `uniffi-bindgen-react-native` from a git source whose prepare step shells out to `yarn build`, so `npm ci` fails without it. Hosted CI images ship yarn already, which is why this only bites on a fresh workstation.

```bash
npm install -g yarn   # or: corepack enable
cd mobile
npm ci
npx tsc --noEmit
npm run lint
npm test -- --runInBand
```

See [`SECURITY_PREAUDIT_0.3.0.md`](SECURITY_PREAUDIT_0.3.0.md) for the reviewed controls, artifact identity and remaining risks.

## Contributing and security

Contributions are welcome under the [MIT License](LICENSE). Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Do not disclose vulnerabilities in public issues; follow [SECURITY.md](SECURITY.md) instead.

## Security warning

This is a mainnet-capable testing build, not an independently audited savings wallet. The published APK uses a local development signing identity. Test only with a very small amount until the open high-severity pre-audit items are closed.
