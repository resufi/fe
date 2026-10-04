# Resu — frontend

The protocol interface: staking where you pick your place in the loss queue.

## Run

```
npm install
npm run dev        # http://localhost:5173
```

The network is chosen via `VITE_NETWORK` in `.env` (`testnet` by default), so
mainnet addresses never show up by accident during local development.

Until `src/deployments/<network>.json` holds addresses, the interface shows
deploy instructions and **does not pretend to work** on made-up data.

## Checks

```
npm run verify-deploy  # reconcile what's deployed with what's intended
npm run check      # everything at once
npm run typecheck  # tsc
npm run selftest   # pure logic, in Node
npm run smoke      # run the app in a browser-like environment
npm run build
```

`selftest.ts` verifies that the message the interface builds is byte-for-byte
what the contracts accept. A wrong bit in an Either flag or a wrong field order
means a lost deposit, silently — the transaction succeeds but no shares are
minted.

`smoke.mjs` bundles the app into a single IIFE and runs it in jsdom, which
**deliberately has no Node globals**. It's a separate check because selftest
runs in Node, where `Buffer` exists — and once missed the app crashing in the
browser on its very first `@ton/core` import.

We validate the test against a negative control: remove `import './polyfills'`
from `main.tsx` and it fails with exactly that `Buffer is not defined`.

## Publishing to GitHub Pages

Build and publish are set up in `.github/workflows/pages.yml` — a push to `main`
runs the same checks as locally, and only then deploys.

One-time, in the repo settings: **Settings → Pages → Source: GitHub Actions**.

Two things that break on Pages if you don't know about them:

**Path.** Pages serves the site at `/<repo>/`, not from the domain root. Without
`base`, every script link points at the root and the page opens blank. The
workflow injects the value from the repo name; it is not hardcoded.

**TonConnect manifest.** Its link is built from `BASE_URL`, not the site root —
otherwise the wallet gets a 404 and replies "invalid manifest". After
publishing, set `url` in `public/tonconnect-manifest.json` to the real address
of the form `https://<account>.github.io/<repo>/`, or wallets will complain
about the mismatch.

**Repository secrets.** All `VITE_*` variables must be in Settings → Secrets →
Actions and listed in the workflow. A missing one doesn't break the build — the
app silently falls back, and you notice only on the live site. That's exactly
how we lost the TonConnect manifest once.

So `npm run check-env` reconciles three lists: what the code reads, what the
workflow passes, and what `.env.example` documents. It also runs in CI before
publishing.

**On the toncenter key.** `VITE_TONCENTER_API_KEY` comes from a repo secret, but
in a static build any `VITE_*` variable **ends up in the public bundle** and is
visible to everyone. It's a rate-limit key, not a money key, but anyone can
exhaust it. For a public site a proxy or your own node is the right answer; a
repo secret is a stopgap.

## Connecting a wallet: the manifest must be public

The wallet **downloads** the manifest itself, from its own device. So
`http://localhost:5173/tonconnect-manifest.json` won't do: the wallet can't see
it and replies "invalid manifest" — even if the file opens fine in the
developer's browser.

For local development, put `public/tonconnect-manifest.json` on any public https
and point to it in `.env`:

```
VITE_TONCONNECT_MANIFEST_URL=https://raw.githubusercontent.com/<...>/manifest.json
```

A tunnel (`cloudflared tunnel --url http://localhost:5173`) or a gist works too.

In production you can leave the variable unset — the origin is already public and
the default path works.

## RPC and request limits

We use a **fixed toncenter**, not the `ton-access` balancer. The reason isn't
theoretical: ton-access spreads requests across nodes, some of which lag, and a
freshly deployed contract simply isn't on them — the interface showed
`exit_code: -13` on a perfectly live protocol.

Requests go **one at a time**, not in a burst. Measurements on toncenter without
a key:

| Mode | Result |
|---|---|
| burst (5 reads at once) | 3 `429` rejections |
| queue, 350 ms apart | 2 rejections |
| queue, 1100 ms apart | no rejections, 5.2 s |

A toncenter key (`VITE_TONCENTER_API_KEY`, free from `@tonapibot`) removes the
limit and the pause drops to 120 ms. **Without a key the interface is noticeably
slow:** a full pass with a connected wallet takes around 28 seconds versus about
2 with a key.

What was done to make that bearable:

- **Retry on 429** with a growing pause. Without it a single rejection dropped
  the whole refresh, leaving stale numbers on screen — including a zero balance
  read before the wallet connected. Telling that apart from "you really have
  zero" was impossible.
- **Cache of derived addresses.** A position's address and a jetton wallet's
  address are derived from addresses and never change — re-reading them each time
  meant four extra requests. After the first load, 9 requests instead of 13.
- **Two-stage load.** The pool shows immediately (about 6 seconds); wallet data
  loads next. Until the balance is read the interface shows `…`, not zero.
- **The pause counts from the end** of the previous refresh, not on a schedule —
  otherwise refreshes would overlap.

Headroom (`lossHeadroom`) is computed **on the client** from already-read data,
not a separate request. That not only saves a call: a separate read could land
between two changes, and the headroom on screen wouldn't match the tranches
shown.

## Node globals

`@ton/core` and `@ton/ton` reach for the global `Buffer` directly. The polyfill
lives in `src/polyfills.ts` and is imported **first** in `main.tsx`.

As a source module, not a build plugin: the plugin injects the polyfill only on
`vite build`, while in dev the graph stays without it — the build passes but
`npm run dev` crashes. A module enters the graph the same way in both modes, so
the smoke test covers both.

## How this maps to the contracts

| What the interface does | Where it sends | What it reads |
|---|---|---|
| Deposit | its jetton wallet → vault | `trancheState`, `vaultState` |
| Withdrawal request | position contract | `positionData` |
| Claim | position contract | `positionAddress` |
| Headroom display | — | `lossHeadroomNow` |

**`forwardTonAmount` is mandatory.** Without it the jetton wallet won't notify
the vault, the jettons land on its balance, and no shares are minted. That's a
TEP-74 property, not our bug — so zero is never acceptable here.

## What is shown and why

A tranche's rate is expressed **relative to the base yield**, not as an absolute
APY. The staking token grows independently of the protocol, and promising a
specific percentage would be lying: senior sees "−2% vs base", junior sees "the
residual".

The loss waterfall is drawn **in real capital proportions**. If junior is thin,
that should be visible, because then senior's protection is weaker.

## Files

```
src/lib/config.ts     addresses and tranche metadata
src/lib/units.ts      decimals
src/lib/format.ts     amounts, percentages, durations
src/lib/chain.ts      reading get-methods
src/lib/payloads.ts   building messages
src/hooks/useProtocol.ts   loading and refreshing state
src/components/       cards, waterfall, deposit, positions
```
