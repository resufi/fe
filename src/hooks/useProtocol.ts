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
    /** Доли на руках: токен транша, его можно переводить и продавать. */
    shares: bigint;
    /** Доли, сожжённые и ждущие созревания заявки. */
    pendingShares: bigint;
    unlockAt: number;
    /** Сколько всё это стоит сейчас, в единицах базового актива. */
    valueNow: bigint;

    // Адреса нужны только TON: там сжигание и получение идут в разные
    // контракты, и оба адреса надо знать заранее. На Solana они выводятся
    // из владельца прямо при сборке транзакции.
    shareWallet?: Address;
    ticket?: Address;
};

/**
 * Данные кошелька отделены от данных пула намеренно.
 *
 * Чтение кошелька — это ещё несколько запросов поверх пула, а публичный узел
 * лимитирован. Раньше всё грузилось одним куском, и до окончания чтения на
 * экране висел баланс из прошлого снимка — то есть ноль, снятый до
 * подключения кошелька. `null` здесь означает «ещё не знаем», и интерфейс
 * обязан показать это, а не выдумать ноль.
 */
export type WalletData = {
    balance: bigint;
    positions: MyPosition[];
    /** Только TON: кошелёк базового жетона, куда уходит перевод при депозите. */
    jettonWallet?: Address;
};

export type ProtocolData = {
    tranches: TrancheState[];
    vault: VaultState;
    headroom: bigint;
    wallet: WalletData | null;
    /** Сколько GRAM за один базовый жетон. null — курс недоступен. */
    rate: number | null;
};

function assetsForShares(t: TrancheState, shares: bigint): bigint {
    if (t.totalShares === 0n) return 0n;
    return (shares * t.totalAssets) / t.totalShares;
}

/**
 * Сколько убытка протокол способен списать сейчас.
 *
 * Повторяет lossHeadroom из контракта, но считается на клиенте. Это не только
 * экономит запрос: отдельное чтение могло прийтись на момент между двумя
 * изменениями, и ёмкость на экране не сходилась бы с показанными траншами.
 * Здесь всё считается из одного снимка.
 */
function lossHeadroom(tranches: TrancheState[], vault: VaultState): bigint {
    const cap = (vault.principalDeposited * BigInt(vault.maxLossBps)) / 10000n;
    const byMandate = cap > vault.cumulativeLoss ? cap - vault.cumulativeLoss : 0n;
    const byAssets = tranches.reduce((sum, t) => sum + t.totalAssets, 0n);
    return byMandate < byAssets ? byMandate : byAssets;
}

/** Пауза между обновлениями, отсчитывается от окончания предыдущего. */
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
            // На Solana состояние читается одним аккаунтом: там нет
            // асинхронных сообщений, и весь пул лежит в одной структуре.
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
                // Курса к SOL пока нет: на девнете базовый актив тестовый,
                // а выдумывать курс хуже, чем показать суммы как есть.
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

                // Пул показываем сразу, кошелёк догружаем: это ещё несколько
                // запросов, и держать экран пустым всё это время незачем.
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

            // Пул показываем сразу, не дожидаясь кошелька: это ещё несколько
            // секунд запросов, и держать экран пустым всё это время незачем.
            const pool = addr.assetPool();
            const rate = pool ? await readAssetRate(pool, addr.jettonMaster()) : null;

            setData({ tranches, vault, headroom, rate, wallet: null });
            if (!wallet) {
                return;
            }

            const owner = Address.parse(wallet);
            const jettonWallet = await readJettonWallet(addr.jettonMaster(), owner);
            const balance = await readJettonBalance(jettonWallet);

            // Последовательно, а не Promise.all: залп упирается в лимит
            // публичного RPC и возвращает отказы вместо данных.
            const positions: MyPosition[] = [];
            for (const t of TRANCHES) {
                const master = addr.trancheMaster(t.id);
                if (!master) continue;

                const shareWallet = await readJettonWallet(master, owner);
                const shares = await readJettonBalance(shareWallet);

                // Заявка есть не всегда: она появляется только после сжигания.
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
            // Публичные RPC регулярно отвечают 429 — показываем это как есть,
            // а не как «протокол сломался».
            setError(e instanceof Error ? e.message : 'Не удалось прочитать данные сети');
        } finally {
            setLoading(false);
        }
    }, [wallet, chain, solanaAddress]);

    // Данные прошлой сети должны исчезнуть сразу, а не висеть до первого
    // ответа новой: цифры чужого пула под чужой вкладкой хуже пустоты.
    useEffect(() => {
        setData(null);
    }, [chain]);

    useEffect(() => {
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;

        // Отсчёт от ОКОНЧАНИЯ прошлого обновления, а не по расписанию.
        // На публичном узле без ключа полный проход занимает секунды, и
        // фиксированный интервал накладывал бы обновления друг на друга,
        // держа узел под постоянной нагрузкой.
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
