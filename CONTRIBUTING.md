# Contributing

Thank you for helping improve BitcoinWallet.

## Before opening a pull request

1. Open an issue for substantial behavior or security-model changes.
2. Keep private keys, recovery phrases, credentials and signing files out of commits and test fixtures.
3. Use testnet or regtest for development; never use a funded seed in tests.
4. Keep wallet accounting in integer satoshis and preserve mainnet/testnet storage separation.
5. Add or update tests for behavior changes.

Run the relevant checks:

```bash
npm ci
npm run build

cd mobile
npm ci
npx tsc --noEmit
npm run lint
npm test -- --runInBand
```

Pull requests should explain the security impact, user-visible behavior, validation performed and any remaining limitations.

## Security reports

Do not open public issues for vulnerabilities. Follow [`SECURITY.md`](SECURITY.md) and use GitHub's private vulnerability reporting flow.

By contributing, you agree that your contribution is licensed under the repository's MIT License.
