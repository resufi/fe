import { useCallback, useEffect, useState } from 'react';
import { Address } from '@ton/core';
import { useTonAddress } from '@tonconnect/ui-react';
import { addr, deployment, isDeployed, TRANCHES } from '../lib/config';
import {
    PositionState,
    readHeadroom,
    readJettonBalance,
    readJettonWallet,
    readPosition,
    readPositionAddress,
    readTranche,
    readVaultState,
    TrancheState,
    VaultState,
} from '../lib/chain';

export type MyPosition = PositionState & {
    trancheId: number;
    address: Address;
    /** Сколько стоят доли прямо сейчас, в единицах базового актива. */
    valueNow: bigint;
};

export type ProtocolData = {
    tranches: TrancheState[];
    vault: VaultState;
    headroom: bigint;
    myBalance: bigint;
    myJettonWallet: Address | null;
    myPositions: MyPosition[];
};

function assetsForShares(t: TrancheState, shares: bigint): bigint {
    if (t.totalShares === 0n) return 0n;
    return (shares * t.totalAssets) / t.totalShares;
}

export function useProtocol() {
    const wallet = useTonAddress();
    const [data, setData] = useState<ProtocolData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        if (!isDeployed) return;
        setLoading(true);
        setError(null);
        try {
            const vaultAddr = addr.vault();
            const [tranches, vault, headroom] = await Promise.all([
                Promise.all(TRANCHES.map((t) => readTranche(vaultAddr, t.id))),
                readVaultState(vaultAddr),
                readHeadroom(vaultAddr),
            ]);

            let myBalance = 0n;
            let myJettonWallet: Address | null = null;
            let myPositions: MyPosition[] = [];

            if (wallet) {
                const owner = Address.parse(wallet);
                myJettonWallet = await readJettonWallet(addr.jettonMaster(), owner);
                myBalance = await readJettonBalance(myJettonWallet);

                const found: (MyPosition | null)[] = await Promise.all(
                    TRANCHES.map(async (t): Promise<MyPosition | null> => {
                        const posAddr = await readPositionAddress(vaultAddr, owner, t.id);
                        const pos = await readPosition(posAddr);
                        if (!pos || (pos.shares === 0n && pos.lockedShares === 0n)) return null;
                        return {
                            ...pos,
                            trancheId: t.id,
                            address: posAddr,
                            valueNow: assetsForShares(tranches[t.id], pos.shares + pos.lockedShares),
                        };
                    }),
                );
                myPositions = found.filter((p): p is MyPosition => p !== null);
            }

            setData({ tranches, vault, headroom, myBalance, myJettonWallet, myPositions });
        } catch (e) {
            // Публичные RPC регулярно отвечают 429 — показываем это как есть,
            // а не как «протокол сломался».
            setError(e instanceof Error ? e.message : 'Не удалось прочитать данные сети');
        } finally {
            setLoading(false);
        }
    }, [wallet]);

    useEffect(() => {
        void refresh();
        const id = setInterval(() => void refresh(), 20000);
        return () => clearInterval(id);
    }, [refresh]);

    return { data, error, loading, refresh, network: deployment.network };
}
