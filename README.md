# Lightning Fork Swap web app

The web front end of Lightning Fork Swap, served at
[lightningfork.com](https://lightningfork.com). It swaps between on-chain BTC on
the Bitcoin BLAKE2b chain and the chain's Lightning network:

- **Submarine swaps**: send on-chain BTC, the service pays your Lightning
  invoice.
- **Reverse swaps**: pay a Lightning invoice, receive on-chain BTC.

Swaps are non-custodial: funds are locked in HTLCs, keys are derived in the
browser from a rescue key that never leaves it, and failed submarine swaps can
be refunded cooperatively or, after the timelock, without the service.

This is a fork of the
[Boltz web app](https://github.com/BoltzExchange/boltz-web-app) 2.2.1, reduced
to BTC and rebranded.

## CHANGES

Compared to boltz-web-app 2.2.1:

- **One asset.** Only BTC and Lightning. Removed: EVM chains and Rootstock,
  Liquid, Solana, Tron, USDT/USDC with OFT and CCTP bridges, DEX routing, chain
  swaps, commitment swaps, gas sponsoring and top-ups, WalletConnect and
  hardware wallets, BOLT12 offers, BIP-353 names, magic routing hints, fiat
  prices, Chatwoot, the products/pro/fee-comparison pages, the docs site and the
  Playwright e2e suite. The matching dependencies are gone (viem, Reown, wagmi,
  Solana, Metaplex, LayerZero, TronWeb, Ledger, Trezor, liquidjs-lib,
  secp256k1-zkp, bolt12-utils).
- **BLAKE2b invoices only.** The chain shares the `lnbc` prefix with SHA256
  Bitcoin, but its Lightning nodes set the required feature bit 512
  (`option_blake2b`) in every invoice. The SDK's `decodeInvoice`
  (`packages/boltz-swaps/src/invoice.ts`) refuses any invoice without bit 512 or
  513, so pasted, scanned and LNURL/Lightning-address invoices are all checked.
- **Same-origin deployment.** The API and the explorer API are expected on the
  origin that serves the app (see below).
- **English only**, with the i18n machinery kept.
- **Rebrand**: name, icons, a single dark theme, short Terms and Privacy pages,
  a footer with only source, legal, rescue and (optional) onion links.
- The rescue key derivation is unchanged from Boltz (`m/44/0/0/0/<index>`).

## Build

Requirements: [Bun](https://bun.sh) and Node.js 24.

```bash
bun install

# mainnet (lightningfork.com)
bun run mainnet
bun run build            # output in dist/

# regtest, for local end-to-end tests
bun run regtest
VITE_API_URL=http://localhost:9001 bun run build
```

`bun run mainnet` / `bun run regtest` copy `src/configs/<network>.ts` to
`src/config.ts`. `bun run start` serves the regtest config with Vite.

Build-time variables (all optional):

| Variable                | Network | Default               | Meaning                                                |
| ----------------------- | ------- | --------------------- | ------------------------------------------------------ |
| `VITE_API_URL`          | both    | page origin / `:9001` | Base URL of the swap API                               |
| `VITE_EXPLORER_API_URL` | regtest | none                  | Esplora-compatible API; without it refunds use the API |
| `VITE_EXPLORER_URL`     | regtest | none                  | Explorer web UI for links                              |

Other knobs live in `src/configs/base.ts`: `repoUrl` (footer source link),
`torUrl` (footer onion link, shown only when set), `swapsSuspended` (shows a
pause notice instead of the swap box; refunds and rescue keep working).

## Deployment expectations

The mainnet build talks only to its own origin:

| Path                | Served by                                                                      |
| ------------------- | ------------------------------------------------------------------------------ |
| `/`                 | `dist/` (unknown paths fall back to `index.html`)                              |
| `/v2/...`           | the swap API (boltz-backend, BTC only)                                         |
| `/v2/ws`            | the API's WebSocket for swap status updates                                    |
| `/explorer/api/...` | proxy to `https://mempool.guide/api/...` (mempool.guide sends no CORS headers) |

Human-facing explorer links open `https://mempool.guide/tx/<id>` and
`/address/<address>` directly. API endpoints the app uses: `/v2/swap/submarine`,
`/v2/swap/reverse` (pairs and creation), `/v2/swap/{id}`, `/v2/swap/status`,
`/v2/swap/submarine/{id}/transaction`, `/claim`, `/refund`, `/preimage`,
`/v2/swap/reverse/{id}/transaction`, `/v2/swap/reverse/{id}/claim`,
`/v2/swap/restore`, `/v2/chain/fees` and `/v2/chain/BTC/transaction`. Explorer
API calls: `/address/{a}/utxo`, `/tx/{id}/hex`, `/tx/{id}/outspend/{vout}`,
`/blocks/tip/height`, `POST /tx`, `/v1/fees/recommended`.

## Checks

```bash
bun run lint          # eslint
bun run lint:style    # stylelint
bun run prettier:check
bun run tsc
bun run test          # vitest for the app and the SDK
```

## License

AGPL-3.0, see [LICENSE](LICENSE). Built on the Boltz web app by
[Boltz](https://github.com/BoltzExchange); the SDK in `packages/boltz-swaps` is
derived from Boltz's MIT-licensed `boltz-swaps`.
