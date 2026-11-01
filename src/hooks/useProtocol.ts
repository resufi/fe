import { useCallback, useEffect, useState } from 'react';
import { Address } from '@ton/core';
import { useTonAddress } from '@tonconnect/ui-react';
import { addrOf, TRANCHES } from '../lib/config';
import type { Pool } from '../lib/pools';
import type { ChainId } from '../lib/chains';
import { readSolanaVault, readSolanaWallet, solanaDeployed } from '../lib/solana';
import { readVault as readEvmVault, readWallet as readEvmWallet, EVM_CHAINS, type EvmPoolContracts, type EvmVaultState } from '../lib/evm';

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
    if (hh === 24) hh = 0;
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

    shares: bigint;

    pendingShares: bigint;
    unlockAt: number;

    valueNow: bigint;

    shareWallet?: Address;
    ticket?: Address;
};

export type WalletData = {
    balance: bigint;
    positions: MyPosition[];

    jettonWallet?: Address;

    allowance?: bigint;
};

export type ProtocolData = {
    tranches: TrancheState[];
    vault: VaultState;
    headroom: bigint;
    wallet: WalletData | null;

    rate: number | null;
};

function assetsForShares(t: TrancheState, shares: bigint): bigint {
    if (t.totalShares === 0n) return 0n;
    return (shares * t.totalAssets) / t.totalShares;
}

function lossHeadroom(tranches: TrancheState[], vault: VaultState): bigint {
    const cap = (vault.principalDeposited * BigInt(vault.maxLossBps)) / 10000n;
    const byMandate = cap > vault.cumulativeLoss ? cap - vault.cumulativeLoss : 0n;
    const byAssets = tranches.reduce((sum, t) => sum + t.totalAssets, 0n);
    return byMandate < byAssets ? byMandate : byAssets;
}

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

    const [paused, setPaused] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        setPaused(null);
        try {
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

                setData({ ...base, wallet: null });
                const w = await readSolanaWallet(solanaAddress, tranches);
                setData({ ...base, wallet: w });
                return;
            }

            if (chain in EVM_CHAINS) {
                const evmPool: EvmPoolContracts = {
                    chain,
                    vault: pool.vault!,
                    asset: pool.jettonMaster!,
                    trancheTokens: pool.trancheMasters,
                };

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

                const base = { tranches, vault, headroom: 0n, rate: null };

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

            const ratePool = addr.assetPool();
            const rate = ratePool ? await readAssetRate(ratePool, addr.jettonMaster()) : null;

            setData({ tranches, vault, headroom, rate, wallet: null });
            if (!wallet) {
                return;
            }

            const owner = Address.parse(wallet);
            const jettonWallet = await readJettonWallet(addr.jettonMaster(), owner);
            const balance = await readJettonBalance(jettonWallet);

            const positions: MyPosition[] = [];
            for (const t of TRANCHES) {
                const master = addr.trancheMaster(t.id);
                if (!master) continue;

                const shareWallet = await readJettonWallet(master, owner);
                const shares = await readJettonBalance(shareWallet);

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

            const limited = /429|rate limit|too many requests/i.test(raw);

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

    useEffect(() => {
        setData(null);
    }, [pool]);

    useEffect(() => {
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;

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
