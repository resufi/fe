import { useCallback, useEffect, useState } from 'react';
import { Address } from '@ton/core';
import { useTonAddress } from '@tonconnect/ui-react';
import { addrOf, TRANCHES } from '../lib/config';
import type { Pool } from '../lib/pools';
import type { ChainId } from '../lib/chains';
import { readSolanaVault, readSolanaWallet, solanaDeployed } from '../lib/solana';
import { readVault as readEvmVault, readWallet as readEvmWallet, EVM_CHAINS, type EvmPoolContracts, type EvmVaultState } from '../lib/evm';

/**
 * Hours until the next US stock-market open (weekdays, ~9:30 New York).
 * Approximate: ignoring holidays and ±1h for daylight-saving shifts —
 * enough for the "market paused" badge. Needed for coupon pools on
 * stocks, where the Chainlink feed doesn't update while the exchange is closed.
 */
function hoursUntilUsMarketOpen(): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const idx: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dow = idx[get('weekday')] ?? 1;
    let hh = Number(get('hour'));
    if (hh === 24) hh = 0; // some environments return '24' for midnight
    const minsNow = hh * 60 + Number(get('minute'));
    const OPEN = 9 * 60 + 30;
    let days = 0;
    for (let i = 0; i < 8; i++) {
        const day = (dow + i) % 7;
        const weekday = day >= 1 && day <= 5;
        if (weekday && (i > 0 || minsNow < OPEN)) {
            days = i;
            break;
        }
    }
    return Math.max(0, Math.round((days * 1440 + (OPEN - minsNow)) / 60));
}
import {
    hasApiKey,
    readAssetRate,
    readJettonBalance,
    readJettonWallet,
    readTicket,
    readTicketAddress,
    readTranche,
    readVaultState,
    TrancheState,
    VaultState,
} from '../lib/chain';

export type MyPosition = {
    trancheId: number;
    /** Held shares: the tranche token, transferable and sellable. */
    shares: bigint;
    /** Shares burned and awaiting a ticket's maturity. */
    pendingShares: bigint;
    unlockAt: number;
    /** What all of it is worth now, in base-asset units. */
    valueNow: bigint;

    // Addresses are needed only on TON: there burning and claiming go to different
    // contracts, and both must be known in advance. On Solana they're derived
    // from the owner right when building the transaction.
    shareWallet?: Address;
    ticket?: Address;
};

/**
 * Wallet data is separated from pool data on purpose.
 *
 * Reading the wallet is a few more requests on top of the pool, and a public node
 * is rate-limited. Everything used to load in one chunk, and until the read finished
 * the screen showed a balance from the previous snapshot — i.e. a zero read before
 * the wallet connected. `null` here means "we don't know yet", and the interface
 * must show that, not invent a zero.
 */
export type WalletData = {
    balance: bigint;
    positions: MyPosition[];
    /** TON only: the base jetton wallet the deposit transfer goes to. */
    jettonWallet?: Address;
    /**
     * EVM only: how much the owner allowed the pool to spend.
     *
     * In ERC20 approval is a separate transaction, and without it the deposit
     * reverts. The interface must know this BEFORE the tap, not after.
     */
    allowance?: bigint;
};

export type ProtocolData = {
    tranches: TrancheState[];
    vault: VaultState;
    headroom: bigint;
    wallet: WalletData | null;
    /** How many GRAM per base jetton. null — the rate is unavailable. */
    rate: number | null;
};

function assetsForShares(t: TrancheState, shares: bigint): bigint {
    if (t.totalShares === 0n) return 0n;
    return (shares * t.totalAssets) / t.totalShares;
}

/**
 * How much loss the protocol can absorb right now.
 *
 * Mirrors lossHeadroom from the contract, but computed on the client. That not only
 * saves a request: a separate read could land between two
 * changes, and the headroom on screen wouldn't match the tranches shown.
 * Here everything is computed from one snapshot.
 */
function lossHeadroom(tranches: TrancheState[], vault: VaultState): bigint {
    const cap = (vault.principalDeposited * BigInt(vault.maxLossBps)) / 10000n;
    const byMandate = cap > vault.cumulativeLoss ? cap - vault.cumulativeLoss : 0n;
    const byAssets = tranches.reduce((sum, t) => sum + t.totalAssets, 0n);
    return byMandate < byAssets ? byMandate : byAssets;
}

/**
 * The pause between refreshes, counted from the end of the previous one.
 *
 * Per chain, because the limit belongs to the node. The toncenter key used to
 * set the pace for every chain at once, Base included, where it means nothing:
 * a TON key made the Base loop three times faster against a node that had
 * never heard of it.
 *
 * An EVM pass is one `eth_call` through multicall, so 20s is cheap. TON needs
 * a dozen separate reads, hence the gap three times longer without a key.
 */
function refreshGapMs(chain: ChainId): number {
    if (chain in EVM_CHAINS) return 20000;
    return hasApiKey ? 15000 : 45000;
}

export function useProtocol(
    pool: Pool,
    solanaAddress: string | null = null,
    evmAddress: string | null = null,
) {
    const chain = pool.chain;
    const addr = addrOf(pool);
    const wallet = useTonAddress();
    const [data, setData] = useState<ProtocolData | null>(null);
    const [error, setError] = useState<string | null>(null);
    // The pool is live but the Chainlink feed went stale (stock market closed). Then we show
    // the pool card with a badge, not an error screen.
    const [paused, setPaused] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        setPaused(null);
        try {
            // On Solana state is read from one account: there are no
            // async messages, and the whole pool sits in one struct.
            if (chain === "solana") {
                if (!solanaDeployed) return;
                const v = await readSolanaVault();
                const tranches = v.tranches.map((t) => ({
                    totalAssets: t.totalAssets,
                    totalShares: t.totalShares,
                }));
                const vault: VaultState = {
                    principalDeposited: v.principalDeposited,
                    cumulativeLoss: v.cumulativeLoss,
                    maxLossBps: v.mandate.maxLossBps,
                    withdrawDelay: v.mandate.withdrawDelay,
                };
                // No SOL rate yet: on devnet the base asset is a test one,
                // and inventing a rate is worse than showing amounts as-is.
                const base = {
                    tranches,
                    vault,
                    headroom: lossHeadroom(tranches, vault),
                    rate: null,
                };

                if (!solanaAddress) {
                    setData({ ...base, wallet: null });
                    return;
                }

                // We show the pool immediately and load the wallet after: that's a few more
                // requests, and keeping the screen empty all that time is pointless.
                setData({ ...base, wallet: null });
                const w = await readSolanaWallet(solanaAddress, tranches);
                setData({ ...base, wallet: w });
                return;
            }

            // HyperEVM: state is read from one contract; there is no mandate-based
            // loss there — shares are re-derived from the pool's value.
            if (chain in EVM_CHAINS) {
                // The pool's addresses on an EVM chain. Share tokens are in trancheMasters.
                const evmPool: EvmPoolContracts = {
                    chain,
                    vault: pool.vault!,
                    asset: pool.jettonMaster!,
                    trancheTokens: pool.trancheMasters,
                };
                // On coupon stock pools nav() reverts with "stale price"
                // when the market is closed (the feed hasn't updated for longer than maxStaleness).
                // The pool still works — we show it with zeros and a badge,
                // rather than hiding it behind an error.
                let v: EvmVaultState;
                let isPaused = false;
                try {
                    v = await readEvmVault(evmPool);
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    if (!/stale price/i.test(msg)) throw e;
                    isPaused = true;
                    const h = hoursUntilUsMarketOpen();
                    const when =
                        h <= 0
                            ? "shortly"
                            : h === 1
                                ? "in about 1 hour"
                                : `in about ${h} hours`;
                    setPaused(
                        `Markets are on pause — stocks trade on weekdays only. The pool is live; prices and values resume when the market reopens ${when}.`,
                    );
                    v = { nav: 0n, values: [0n, 0n, 0n], totalShares: [0n, 0n, 0n] };
                }
                const tranches = [0, 1, 2].map((i) => ({
                    totalAssets: v.values[i],
                    totalShares: v.totalShares[i],
                }));
                const vault: VaultState = {
                    principalDeposited: v.nav,
                    cumulativeLoss: 0n,
                    maxLossBps: 0,
                    withdrawDelay: pool.mandate.withdrawDelay,
                };
                // There is no loss ceiling, so no headroom either: showing it as
                // zero is more honest than inventing one.
                const base = { tranches, vault, headroom: 0n, rate: null };

                // While paused we don't load the wallet: nav/values are zero, there's nothing
                // to build a position from — the pool card with a badge is enough.
                if (isPaused || !evmAddress) {
                    setData({ ...base, wallet: null });
                    return;
                }
                setData({ ...base, wallet: null });
                const w = await readEvmWallet(evmPool, evmAddress);
                setData({
                    ...base,
                    wallet: {
                        balance: w.balance,
                        allowance: w.allowance,
                        positions: [0, 1, 2]
                            .filter((i) => w.shares[i] > 0n || w.tickets[i].shares > 0n)
                            .map((i) => ({
                                trancheId: i,
                                shares: w.shares[i],
                                pendingShares: w.tickets[i].shares,
                                unlockAt: w.tickets[i].unlockAt,
                                valueNow: assetsForShares(tranches[i], w.shares[i] + w.tickets[i].shares),
                            })),
                    },
                });
                return;
            }

            if (!pool.deployed) return;
            const vaultAddr = addr.vault();
            const tranches: TrancheState[] = [];
            for (const t of TRANCHES) {
                tranches.push(await readTranche(vaultAddr, t.id));
            }
            const vault = await readVaultState(vaultAddr);
            const headroom = lossHeadroom(tranches, vault);

            // We show the pool immediately, without waiting for the wallet: that's a few more
            // seconds of requests, and keeping the screen empty all that time is pointless.
            // The base asset's rate to GRAM. A stablecoin has none — and inventing it
            // is not allowed: dollars convert to GRAM only through the market.
            const ratePool = addr.assetPool();
            const rate = ratePool ? await readAssetRate(ratePool, addr.jettonMaster()) : null;

            setData({ tranches, vault, headroom, rate, wallet: null });
            if (!wallet) {
                return;
            }

            const owner = Address.parse(wallet);
            const jettonWallet = await readJettonWallet(addr.jettonMaster(), owner);
            const balance = await readJettonBalance(jettonWallet);

            // Sequentially, not Promise.all: a burst hits the limit of the
            // public RPC and returns rejections instead of data.
            const positions: MyPosition[] = [];
            for (const t of TRANCHES) {
                const master = addr.trancheMaster(t.id);
                if (!master) continue;

                const shareWallet = await readJettonWallet(master, owner);
                const shares = await readJettonBalance(shareWallet);

                // A ticket isn't always there: it appears only after a burn.
                const ticket = await readTicketAddress(vaultAddr, owner, t.id);
                const pending = await readTicket(ticket);
                const pendingShares = pending?.pendingShares ?? 0n;

                if (shares === 0n && pendingShares === 0n) continue;
                positions.push({
                    trancheId: t.id,
                    shares,
                    pendingShares,
                    unlockAt: pending?.unlockAt ?? 0,
                    shareWallet,
                    ticket,
                    valueNow: assetsForShares(tranches[t.id], shares + pendingShares),
                });
            }

            setData({ tranches, vault, headroom, rate, wallet: { balance, jettonWallet, positions } });
        } catch (e) {
            const raw = e instanceof Error ? e.message : 'Could not read network data';
            /*
             * A public node answers 429 when it dislikes the pace. The reader
             * already waits and retries, so by the time it reaches here the
             * limit has outlasted the retries — that is about the node, not
             * about the protocol, and the numbers already on screen are still
             * the numbers. Previous data stays; this only labels it.
             */
            const limited = /429|rate limit|too many requests/i.test(raw);
            // Coupon stock pools honestly revert with "stale price" when the
            // Chainlink feed hasn't updated for longer than maxStaleness — i.e. while the market
            // is closed (weekends, holidays). It's not a failure: we show it calmly.
            const stalePrice = /stale price/i.test(raw);
            setError(
                stalePrice
                    ? 'Price feed is paused — the stock market is closed. Live values resume when it reopens.'
                    : limited
                        ? 'The public node is rate-limiting us. Numbers may be a little behind; the next refresh usually gets through.'
                        : raw,
            );
        } finally {
            setLoading(false);
        }
    }, [wallet, pool, solanaAddress, evmAddress]);

    // The previous chain's data must disappear at once, not linger until the first
    // response of the new one: another pool's numbers under another tab are worse than nothing.
    useEffect(() => {
        setData(null);
    }, [pool]);

    useEffect(() => {
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;

        // Counted from the END of the previous refresh, not on a schedule.
        // On a public node without a key a full pass takes seconds, and
        // a fixed interval would overlap refreshes,
        // keeping the node under constant load.
        const loop = async () => {
            await refresh();
            if (!stopped) timer = setTimeout(() => void loop(), refreshGapMs(pool.chain));
        };
        void loop();

        return () => {
            stopped = true;
            clearTimeout(timer);
        };
    }, [refresh]);

    return {
        data,
        error,
        paused,
        loading,
        refresh,
        network: pool.network,
    };
}
