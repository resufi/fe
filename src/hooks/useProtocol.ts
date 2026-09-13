import { useCallback, useEffect, useState } from 'react';
import { Address } from '@ton/core';
import { useTonAddress } from '@tonconnect/ui-react';
import { addr, deployment, isDeployed, TRANCHES } from '../lib/config';
import type { ChainId } from '../lib/chains';
import { readSolanaVault, readSolanaWallet, solanaDeployed, solanaDeployment } from '../lib/solana';
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

const REFRESH_GAP_MS = hasApiKey ? 15000 : 45000;

export function useProtocol(chain: ChainId = "ton", solanaAddress: string | null = null) {
    const wallet = useTonAddress();
    const [data, setData] = useState<ProtocolData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
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

            if (!isDeployed) return;
            const vaultAddr = addr.vault();
            const tranches: TrancheState[] = [];
            for (const t of TRANCHES) {
                tranches.push(await readTranche(vaultAddr, t.id));
            }
            const vault = await readVaultState(vaultAddr);
            const headroom = lossHeadroom(tranches, vault);

            const pool = addr.assetPool();
            const rate = pool ? await readAssetRate(pool, addr.jettonMaster()) : null;

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
            setError(e instanceof Error ? e.message : 'Не удалось прочитать данные сети');
        } finally {
            setLoading(false);
        }
    }, [wallet, chain, solanaAddress]);

    useEffect(() => {
        setData(null);
    }, [chain]);

    useEffect(() => {
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;

        const loop = async () => {
            await refresh();
            if (!stopped) timer = setTimeout(() => void loop(), REFRESH_GAP_MS);
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
        loading,
        refresh,
        network: chain === "solana" ? solanaDeployment.network : deployment.network,
    };
}
