import { Address, TonClient, TupleBuilder } from '@ton/ton';
import { deployment } from './config';

/**
 * RPC-эндпоинт.
 *
 * Намеренно фиксированный toncenter, а НЕ балансировщик ton-access. Причина
 * не теоретическая: ton-access раскидывает запросы по узлам, среди которых
 * попадаются отставшие, и на них свежеразвёрнутого контракта просто нет.
 * Пять параллельных чтений при обновлении состояния попадали на разные узлы,
 * часть отвечала `exit_code: -13`, и интерфейс показывал ошибку на живом
 * протоколе. Тот же балансировщик до этого отдавал `uninitialized` и баланс
 * 494 GRAM для контракта, который на самом деле active с 80 197 GRAM.
 *
 * Один постоянный узел даёт согласованную картину, пусть и ценой лимита
 * запросов — см. очередь ниже.
 */
const TONCENTER = {
    mainnet: 'https://toncenter.com/api/v2/jsonRPC',
    testnet: 'https://testnet.toncenter.com/api/v2/jsonRPC',
};

const OVERRIDE = import.meta.env.VITE_TON_ENDPOINT as string | undefined;
const API_KEY = import.meta.env.VITE_TONCENTER_API_KEY as string | undefined;

let client: TonClient | null = null;

export function getClient(): TonClient {
    if (!client) {
        client = new TonClient({
            endpoint: OVERRIDE ?? TONCENTER[deployment.network],
            apiKey: API_KEY,
        });
    }
    return client;
}

/**
 * Очередь запросов.
 *
 * Без ключа toncenter пропускает примерно один запрос в секунду, а одно
 * обновление состояния — это до полутора десятков чтений. Залпом они
 * упираются в лимит и возвращаются ошибками, которые на экране неотличимы
 * от «протокол сломался».
 *
 * Поэтому запросы идут по одному с паузой. С ключом пауза не нужна: лимит
 * снимается, и интерфейс обновляется заметно живее.
 */
// Без ключа toncenter пропускает примерно один запрос в секунду — замерено:
// залп из пяти чтений возвращал три отказа 429, интервал в 350 мс — два.
// С ключом лимит снимается, хватает минимальной паузы.
const MIN_INTERVAL_MS = API_KEY ? 120 : 1100;

/** Есть ли ключ toncenter. Интерфейс подсказывает, если его нет. */
export const hasApiKey = Boolean(API_KEY);

let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRateLimited(e: unknown): boolean {
    const status = (e as { response?: { status?: number } })?.response?.status;
    return status === 429 || String((e as Error)?.message ?? '').includes('429');
}

/**
 * Сколько раз повторить чтение, упёршееся в лимит.
 *
 * Без повтора одно отклонение роняло всё обновление, и на экране оставались
 * прежние числа — в том числе нулевой баланс, снятый до подключения кошелька.
 * Отличить это от «у вас правда ноль» пользователь не мог никак.
 */
const RETRIES = 4;

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
        for (let attempt = 0; ; attempt++) {
            const wait = MIN_INTERVAL_MS - (Date.now() - lastAt);
            if (wait > 0) await sleep(wait);
            try {
                return await fn();
            } catch (e) {
                if (!isRateLimited(e) || attempt >= RETRIES) throw e;
                // Пауза растёт: 1с, 2с, 4с, 8с.
                await sleep(1000 * 2 ** attempt);
            } finally {
                lastAt = Date.now();
            }
        }
    });
    // Цепочку не рвём даже на ошибке: иначе одно неудачное чтение
    // разблокировало бы залп остальных.
    chain = run.catch(() => undefined);
    return run as Promise<T>;
}

/**
 * Кеш для значений, которые вычисляются из адресов и не меняются никогда:
 * адрес позиции и адрес кошелька жетона. Перечитывать их при каждом
 * обновлении — четыре лишних запроса на ровном месте, а лимит публичного
 * узла жёсткий.
 */
const derived = new Map<string, Address>();

async function cachedAddress(key: string, fetchIt: () => Promise<Address>): Promise<Address> {
    const hit = derived.get(key);
    if (hit) return hit;
    const value = await fetchIt();
    derived.set(key, value);
    return value;
}

async function call(address: Address, method: string, args: (bigint | Address)[] = []) {
    const b = new TupleBuilder();
    for (const a of args) {
        if (typeof a === 'bigint') b.writeNumber(a);
        else b.writeAddress(a);
    }
    return enqueue(() => getClient().runMethod(address, method, b.build()));
}

/**
 * Курс базового жетона к GRAM.
 *
 * Нужен, потому что учёт в протоколе ведётся в tsTON, и рост самого tsTON в
 * цену нашей доли не попадает. Без пересчёта senior видит цену доли 0.98 и
 * думает, что теряет деньги, хотя в GRAM он в плюсе.
 *
 * Прямого метода пересчёта у пула нет, поэтому считаем из его данных:
 * сколько GRAM обеспечивают всю эмиссию жетона. Раскладка полей чужого
 * контракта — не то, чему стоит доверять слепо, поэтому результат
 * проверяется на вменяемость (см. RATE_BOUNDS).
 */
const POOL_TOTAL_BALANCE_INDEX = 2;

/**
 * Курс ликвидного стейкинг-жетона к базовой монете не может быть меньше
 * единицы (жетон только накапливает награды) и вырастет вдвое лет за
 * шестнадцать. Всё, что вне этих границ, — признак того, что мы читаем не то
 * поле; тогда честнее не показывать GRAM вовсе, чем показать выдумку.
 */
const RATE_BOUNDS = { min: 1, max: 3 };

const RATE_TTL_MS = 10 * 60 * 1000;
let rateCache: { value: number; at: number } | null = null;

/**
 * Сколько GRAM стоит один базовый жетон. null — если курс получить не
 * удалось или он не прошёл проверку.
 */
export async function readAssetRate(pool: Address, master: Address): Promise<number | null> {
    if (rateCache && Date.now() - rateCache.at < RATE_TTL_MS) return rateCache.value;

    try {
        const poolData = await enqueue(() => getClient().runMethod(pool, 'get_pool_full_data', []));
        let backing: bigint | null = null;
        for (let i = 0; i <= POOL_TOTAL_BALANCE_INDEX; i++) {
            const item = poolData.stack.pop();
            if (i === POOL_TOTAL_BALANCE_INDEX && item.type === 'int') backing = item.value;
        }
        if (backing === null || backing <= 0n) return null;

        const supply = (await call(master, 'get_jetton_data')).stack.readBigNumber();
        if (supply <= 0n) return null;

        const value = Number(backing) / Number(supply);
        if (!Number.isFinite(value) || value < RATE_BOUNDS.min || value > RATE_BOUNDS.max) return null;

        rateCache = { value, at: Date.now() };
        return value;
    } catch {
        // Курс — украшение, а не основа: без него интерфейс работает,
        // просто показывает суммы в базовом жетоне.
        return null;
    }
}

export type TrancheState = { totalAssets: bigint; totalShares: bigint };

export async function readTranche(vault: Address, trancheId: number): Promise<TrancheState> {
    const res = await call(vault, 'trancheState', [BigInt(trancheId)]);
    return { totalAssets: res.stack.readBigNumber(), totalShares: res.stack.readBigNumber() };
}

export type VaultState = {
    principalDeposited: bigint;
    cumulativeLoss: bigint;
    maxLossBps: number;
    withdrawDelay: number;
};

export async function readVaultState(vault: Address): Promise<VaultState> {
    const res = await call(vault, 'vaultState');
    return {
        principalDeposited: res.stack.readBigNumber(),
        cumulativeLoss: res.stack.readBigNumber(),
        maxLossBps: res.stack.readNumber(),
        withdrawDelay: res.stack.readNumber(),
    };
}

export async function readPositionAddress(vault: Address, owner: Address, trancheId: number): Promise<Address> {
    return cachedAddress(`pos:${vault}:${owner}:${trancheId}`, async () => {
        const res = await call(vault, 'positionAddress', [owner, BigInt(trancheId)]);
        return res.stack.readAddress();
    });
}

export type PositionState = {
    shares: bigint;
    lockedShares: bigint;
    unlockAt: number;
};

/** Позиции может не быть вовсе — это норма, а не ошибка. */
export async function readPosition(position: Address): Promise<PositionState | null> {
    const state = await enqueue(() => getClient().getContractState(position));
    if (state.state !== 'active') return null;

    const res = await call(position, 'positionData');
    res.stack.readAddress(); // vault
    res.stack.readAddress(); // owner
    res.stack.readNumber(); // trancheId
    return {
        shares: res.stack.readBigNumber(),
        lockedShares: res.stack.readBigNumber(),
        unlockAt: res.stack.readNumber(),
    };
}

/** Адрес кошелька жетона, который мастер выдал этому владельцу. */
export async function readJettonWallet(master: Address, owner: Address): Promise<Address> {
    return cachedAddress(`jw:${master}:${owner}`, async () => {
        const res = await call(master, 'get_wallet_address', [owner]);
        return res.stack.readAddress();
    });
}

/**
 * Баланс жетона.
 *
 * Ноль возвращается только тогда, когда кошелька жетона действительно нет —
 * то есть человек этот жетон никогда не держал. Любая другая неудача
 * пробрасывается наверх: молчаливый ноль вместо ошибки чтения выглядит как
 * «у вас пусто», и отличить одно от другого невозможно.
 */
export async function readJettonBalance(wallet: Address): Promise<bigint> {
    const state = await enqueue(() => getClient().getContractState(wallet));
    if (state.state === 'uninitialized') return 0n;
    const res = await call(wallet, 'get_wallet_data');
    return res.stack.readBigNumber();
}
