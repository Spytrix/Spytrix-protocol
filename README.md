# Spytrix

**Privacy meets Solana payments.**

[![Live site](https://img.shields.io/badge/live-spytrix.fun-fea22e?style=flat-square)](https://spytrix.fun)
![Chain](https://img.shields.io/badge/chain-Solana-5b3f86?style=flat-square)

| | |
|---|---|
| Chain | Solana, main network |
| Contract address | `CA: to be announced` |
| Site | https://spytrix.fun |
| X | https://x.com/Spytrix_Fun |

## Overview

Spytrix is a privacy layer for Solana payments. A normal transfer ties sender and receiver together in public view. Spytrix is built around the opposite idea: a counterparty should learn that they were paid, and nothing more about the account that paid them.

This repository holds the project website: a static front end with a perpetual market board for Solana.

## Features

- Contract-address slot pinned to the top of every view, with click-to-copy feedback (inert until one exists)
- Market board for the busiest Solana tokens, refreshed each minute whenever the tab is in view
- Own-token row pinned to position one, fed by two independent public sources fetched side by side
- Skeleton loaders, count-up values with change flashes, and a scrolling ticker built from the same feed
- Zero-motion fallback for visitors who ask for it

## Links

- Website: https://spytrix.fun
- X: https://x.com/Spytrix_Fun
- Whitepaper: [docs/whitepaper.md](docs/whitepaper.md)

## Develop

```bash
npm install
npm run prep      # regenerate logo, favicon and banner from brand/ and reference/
npm run build     # writes the deployable site to dist/
npm run verify    # builds both contract-address branches and runs every gate
npm run serve     # serves dist/ on http://localhost:4173
```

To exercise the published-address branch locally, build with `SPYTRIX_CA=<mint>` and `SPYTRIX_OUT=.verify/ca`. To announce the real mint, change the `ca` record in `src/registry.json` to `stated` and add its value.

## License

MIT. See [LICENSE](LICENSE).
