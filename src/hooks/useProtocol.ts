import { useCallback, useEffect, useState } from 'react';
import { Address } from '@ton/core';
import { useTonAddress } from '@tonconnect/ui-react';
import { addrOf, TRANCHES } from '../lib/config';
import type { Pool } from '../lib/pools';
import { readSolanaVault, readSolanaWallet, solanaDeployed } from '../lib/solana';
import { readVault as readEvmVault, readWallet as readEvmWallet, EVM_CHAINS, type EvmPoolContracts, type EvmVaultState } from '../lib/evm';

/**
 * Часы до ближайшего открытия рынка акций США (будни, ~9:30 по Нью-Йорку).
 * Приблизительно: без учёта праздников и ±1ч на переход летнего времени —
 * этого достаточно для плашки «рынок на паузе». Нужен для купонных пулов на
 * акциях, где фид Chainlink не обновляется, пока биржа закрыта.
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
    if (hh === 24) hh = 0; // некоторые среды дают '24' для полуночи
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
    /**
     * Только EVM: сколько владелец разрешил пулу списать.
     *
     * У ERC20 разрешение — отдельная транзакция, и без него депозит
     * откатится. Интерфейс обязан знать это ДО нажатия, а не после.
     */
    allowance?: bigint;
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
    // Пул жив, но фид Chainlink протух (рынок акций закрыт). Тогда показываем
    // карточку пула с плашкой, а не экран ошибки.
    const [paused, setPaused] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        setPaused(null);
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

            // HyperEVM: состояние читается одним контрактом, потерь по
            // мандату там нет — доли выводятся из стоимости пула заново.
            if (chain in EVM_CHAINS) {
                // Адреса пула на EVM-сети. Токены долей у нас в trancheMasters.
                const evmPool: EvmPoolContracts = {
                    chain,
                    vault: pool.vault!,
                    asset: pool.jettonMaster!,
                    trancheTokens: pool.trancheMasters,
                };
                // На купонных пулах с акциями nav() реветит «stale price»,
                // когда рынок закрыт (фид не обновлялся дольше maxStaleness).
                // Пул при этом рабочий — показываем его с нулями и плашкой,
                // а не прячем за ошибкой.
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
                // Потолка убытка нет, поэтому и ёмкости нет: показывать её
                // нулём честнее, чем выдумывать.
                const base = { tranches, vault, headroom: 0n, rate: null };

                // На паузе кошелёк не догружаем: nav/values нулевые, показывать
                // позицию не из чего — достаточно карточки пула с плашкой.
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

            // Пул показываем сразу, не дожидаясь кошелька: это ещё несколько
            // секунд запросов, и держать экран пустым всё это время незачем.
            // Курс базового актива к GRAM. У стейбла его нет — и выдумывать
            // нельзя: доллары в GRAM пересчитываются только через рынок.
            const ratePool = addr.assetPool();
            const rate = ratePool ? await readAssetRate(ratePool, addr.jettonMaster()) : null;

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
            const raw = e instanceof Error ? e.message : 'Не удалось прочитать данные сети';
            // Купонные пулы на акциях честно реветят «stale price», когда фид
            // Chainlink не обновлялся дольше maxStaleness — то есть пока рынок
            // закрыт (выходные, праздники). Это не поломка: показываем спокойно.
            const stalePrice = /stale price/i.test(raw);
            setError(
                stalePrice
                    ? 'Price feed is paused — the stock market is closed. Live values resume when it reopens.'
                    : raw,
            );
        } finally {
            setLoading(false);
        }
    }, [wallet, pool, solanaAddress, evmAddress]);

    // Данные прошлой сети должны исчезнуть сразу, а не висеть до первого
    // ответа новой: цифры чужого пула под чужой вкладкой хуже пустоты.
    useEffect(() => {
        setData(null);
    }, [pool]);

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
        paused,
        loading,
        refresh,
        network: pool.network,
    };
}
