import { Address, TonClient, TupleBuilder } from '@ton/ton';
import { deployment } from './config';
import { env } from "./env.ts";

const TONCENTER = {
    mainnet: 'https://toncenter.com/api/v2/jsonRPC',
    testnet: 'https://testnet.toncenter.com/api/v2/jsonRPC',
};

const OVERRIDE = env("VITE_TON_ENDPOINT");
const API_KEY = env("VITE_TONCENTER_API_KEY");

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

const MIN_INTERVAL_MS = API_KEY ? 120 : 1100;

export const hasApiKey = Boolean(API_KEY);

let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRateLimited(e: unknown): boolean {
    const status = (e as { response?: { status?: number } })?.response?.status;
    return status === 429 || String((e as Error)?.message ?? '').includes('429');
}

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

                await sleep(1000 * 2 ** attempt);
            } finally {
                lastAt = Date.now();
            }
        }
    });

    chain = run.catch(() => undefined);
    return run as Promise<T>;
}

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

const POOL_TOTAL_BALANCE_INDEX = 2;

const RATE_BOUNDS = { min: 1, max: 3 };

const RATE_TTL_MS = 10 * 60 * 1000;
let rateCache: { value: number; at: number } | null = null;

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

export async function readTicketAddress(vault: Address, owner: Address, trancheId: number): Promise<Address> {
    return cachedAddress(`ticket:${vault}:${owner}:${trancheId}`, async () => {
        const res = await call(vault, 'ticketAddress', [owner, BigInt(trancheId)]);
        return res.stack.readAddress();
    });
}

export type TicketState = { pendingShares: bigint; unlockAt: number };

export async function readTicket(ticket: Address): Promise<TicketState | null> {
    const state = await enqueue(() => getClient().getContractState(ticket));
    if (state.state !== 'active') return null;

    const res = await call(ticket, 'ticketData');
    res.stack.readAddress();
    res.stack.readAddress();
    res.stack.readNumber();
    return {
        pendingShares: res.stack.readBigNumber(),
        unlockAt: res.stack.readNumber(),
    };
}

export async function readJettonWallet(master: Address, owner: Address): Promise<Address> {
    return cachedAddress(`jw:${master}:${owner}`, async () => {
        const res = await call(master, 'get_wallet_address', [owner]);
        return res.stack.readAddress();
    });
}

export async function readJettonBalance(wallet: Address): Promise<bigint> {
    const state = await enqueue(() => getClient().getContractState(wallet));
    if (state.state === 'uninitialized') return 0n;
    const res = await call(wallet, 'get_wallet_data');
    return res.stack.readBigNumber();
}
