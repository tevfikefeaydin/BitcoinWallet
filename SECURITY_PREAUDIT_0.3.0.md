# BTC Wallet 0.3.0 — Security Pre-Audit

Date: 2026-08-07
Scope: Android ARM64 mainnet application and its React Native/BDK-RN integration
Status: Internal pre-audit; **not an independent security audit**

Reference baseline: OWASP MASVS/MASTG (`https://mas.owasp.org/MASVS/`) plus Bitcoin-wallet-specific transaction, backup and recovery threats.

## Executive result

No confirmed critical vulnerability was found in the reviewed application code. Automated dependency scanning reported zero known npm vulnerabilities, the TypeScript and lint checks passed, and all 10 automated tests passed. The application remains a pre-production wallet until the open items below are independently tested and remediated.

## Reviewed controls

- BIP84/BIP86 descriptor creation and mainnet/testnet isolation
- Mnemonic generation, storage, backup verification and recovery
- PIN derivation, five-attempt permanent application lock and duress profile
- Android Keystore storage level and software fallback behavior
- SQLite location under Android `noBackupFilesDir`
- Transaction address/network validation, fee bounds, RBF and signing options
- Recipient-tail confirmation and address-poisoning warning
- Android screenshot, overlay/tapjacking, backup and cleartext protections
- Esplora network identity validation, HTTPS custom endpoints and sequential fallback
- BTC/SAT exact accounting and read-only USD price conversion
- Release bundling, R8 rules and Metro-disabled production startup

## Findings requiring external follow-up

| ID | Severity | Finding | Current mitigation | Required production action |
|---|---|---|---|---|
| PA-01 | High | APK uses a locally generated development signing identity. | APK hash and signing fingerprint are published at delivery. | Use an isolated production key, Play App Signing/HSM controls and documented key rotation/recovery. |
| PA-02 | High | No independent source review, physical-device penetration test or real-value mainnet round trip has been completed. | Internal tests and emulator QA cover startup, wallet creation and address generation. | Commission an independent mobile/cryptography audit and retest all remediations. |
| PA-03 | Medium | Devices without hardware-backed Keystore fall back to encrypted software Keystore. | The security level is shown prominently and a mainnet warning is displayed. | Add a high-security mode that fails closed or limits funds when hardware attestation is unavailable. |
| PA-04 | Medium | A 6–8 digit PIN has limited entropy if an attacker bypasses Android Keystore and extracts the verifier. | PBKDF2-HMAC-SHA256 uses 600,000 iterations; the app permanently locks after five attempts. | Offer a longer alphanumeric passphrase and bind decryption to device authentication/hardware keys. |
| PA-05 | Medium | Public Esplora providers can correlate queried wallet scripts with IP metadata and can omit or delay data. | HTTPS, genesis/network checks, health checks, explicit provider selection and personal Esplora support are implemented. | Prefer a user-owned node; independently test malicious-server, reorg and inconsistent-response cases. |
| PA-06 | Medium | There is no backend-verified Play Integrity/key-attestation or reproducible CI release pipeline. | Release builds are minified, cleartext is disabled and the artifact is locally verified. | Add deterministic CI, provenance/SBOM, backend verdict verification and release approval controls. |
| PA-07 | Low | USD values depend on remote price providers and may be stale or manipulated. | USD is labelled approximate, timestamped/cached, and never used for transaction accounting or signing. | Add provider divergence warnings and optional user-selected price sources. |
| PA-08 | Informational | Official BDK-RN 1.0 currently makes this APK ARM64-only. | Unsupported devices are rejected at installation instead of failing at runtime. | Reassess when official multi-ABI native artifacts are available. |

## Changes made during pre-audit

- Added an unused receive-address cap of 20 and exposed derivation index/count in the UI.
- Added mainnet genesis verification before trusting an Esplora endpoint.
- Added sequential automatic fallback that queries wallet data from one provider at a time.
- Restricted custom Esplora endpoints to credential-free HTTPS URLs.
- Added exact integer BTC/SAT formatting; USD remains display-only.
- Cleared native PBKDF2 password, salt and derived-key buffers after use where the runtime permits.
- Updated R8 keep rules from the obsolete BDK/JNA integration to official `com.bdkrn` classes.
- Confirmed no production secret or private signing key is stored in the workspace.

## Validated delivery artifact

- File: `BTCWallet-Mainnet-v0.3.0-arm64-signed.apk`
- SHA-256: `2F576466710AAEB3BCA7EA91FC424709E5B7A023AA9AF59541C7A4EEE5D11273`
- Package/version: `com.btcwalletmobile.mainnet`, version code `4`, version name `0.3.0-mainnet`
- Native ABI: `arm64-v8a`
- Signing: APK Signature Scheme v2; certificate SHA-256 `ff4af6a8eb4d3582deeb578af2927fef0d52fb90cb93ad19f385c9d7db43a1c8`
- Release checks: embedded JavaScript bundle present, non-debuggable package, offline cold start without Metro, no fatal React Native/Android runtime log during tested flows.
- Emulator flow: PIN creation, Taproot wallet creation, 12-word backup verification, unlock, receive-address rotation (`#0` to `#1`, unused pool `1/20` to `2/20`), SAT display and Esplora settings exercised successfully.
- Final automated checks: TypeScript, ESLint, 4/4 Jest suites (10/10 tests) and npm dependency audit passed; npm reported zero known vulnerabilities.

## Independent audit acceptance criteria

1. Auditor receives the exact source snapshot, lockfile, build instructions, APK SHA-256 and signing certificate fingerprint.
2. Auditor reproduces or independently builds the reviewed artifact.
3. Tests cover rooted/non-rooted devices, malicious accessibility services, overlays, backups, process memory, logs and clipboard behavior.
4. Wallet tests cover restore gaps, BIP84/BIP86 vectors, UTXO selection, change, RBF, fee extremes, reorgs and malicious Esplora responses.
5. Every finding receives an owner, severity, remediation commit and independent retest result.
6. A tiny-value mainnet receive/send recovery drill is completed before any meaningful funds are used.

## Conclusion

This pre-audit improves readiness but does not certify the wallet or make it suitable for savings. Until PA-01 and PA-02 are closed, the APK should be treated as a mainnet-capable testing build and used only with a very small amount.
