import { env } from "./env.ts";
import type { ChainId } from "./chains.ts";

export type EvmChainParams = {
	chainId: number;
	chainIdHex: string;
	name: string;
	rpc: string;

	rpcEnv?: string;
	explorer: string;
	nativeCurrency: { name: string; symbol: string; decimals: number };
};

export const EVM_CHAINS: Partial<Record<ChainId, EvmChainParams>> = {
	hyperevm: {
		chainId: 999,
		chainIdHex: "0x3e7",
		name: "HyperEVM",
		rpc: "https://rpc.hyperliquid.xyz/evm",
		rpcEnv: "VITE_HYPEREVM_RPC",
		explorer: "https://hyperevm-explorer.vercel.app",
		nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
	},
	robinhood: {
		chainId: 4663,
		chainIdHex: "0x1237",
		name: "Robinhood Chain",
		rpc: "https://rpc.mainnet.chain.robinhood.com",
		rpcEnv: "VITE_ROBINHOOD_RPC",
		explorer: "https://robinhoodchain.blockscout.com",
		nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
	},
	arbitrum: {
		chainId: 42161,
		chainIdHex: "0xa4b1",
		name: "Arbitrum One",
		rpc: "https://arb1.arbitrum.io/rpc",
		rpcEnv: "VITE_ARBITRUM_RPC",
		explorer: "https://arbiscan.io",
		nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
	},
	base: {
		chainId: 8453,
		chainIdHex: "0x2105",
		name: "Base",
		rpc: "https://mainnet.base.org",
		rpcEnv: "VITE_BASE_RPC",
		explorer: "https://basescan.org",
		nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
	},
	monad: {
		chainId: 143,
		chainIdHex: "0x8f",
		name: "Monad",
		rpc: "https://rpc.monad.xyz",
		rpcEnv: "VITE_MONAD_RPC",
		explorer: "https://monadexplorer.com",
		nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
	},
};

export function evmChain(id: ChainId): EvmChainParams {
	const c = EVM_CHAINS[id];
	if (!c) throw new Error(`${id} is not an EVM chain`);
	return c;
}

export function evmRpc(id: ChainId): string {
	const c = evmChain(id);
	return (c.rpcEnv ? env(c.rpcEnv) : undefined) ?? c.rpc;
}

export const SIG = {
	nav: "0xc1590cd7",
	values: "0x971217b7",
	sharePrice: "0x61a9da23",
	pricePerAsset: "0x183d32db",
	totalShares: "0x13f2dad0",
	claims: "0xa888c2cd",
	tickets: "0xdae7a13c",
	deposit: "0xf4d4c9d7",
	requestWithdrawal: "0xa9ac4ddb",
	claim: "0x95d4063f",
	balanceOf: "0x70a08231",
	allowance: "0xdd62ed3e",
	approve: "0x095ea7b3",
} as const;

export const word = (v: bigint | number | string): string => {
	if (typeof v === "string") return v.toLowerCase().replace(/^0x/, "").padStart(64, "0");
	return BigInt(v).toString(16).padStart(64, "0");
};

export const encode = (selector: string, ...args: (bigint | number | string)[]): string =>
	selector + args.map(word).join("");

const words = (hex: string): bigint[] => {
	const body = hex.replace(/^0x/, "");
	const out: bigint[] = [];
	for (let i = 0; i + 64 <= body.length; i += 64) out.push(BigInt("0x" + body.slice(i, i + 64)));
	return out;
};

let nextId = 1;

const MIN_GAP_MS = 250;

const RETRIES = 4;

const queues = new Map<string, Promise<unknown>>();
const lastAt = new Map<string, number>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class RateLimited extends Error {
	constructor() {
		super("EVM RPC 429");
		this.name = "RateLimited";
	}
}

const isRateLimited = (e: unknown): boolean =>
	e instanceof RateLimited ||
	/rate limit|too many requests|429/i.test(
		e instanceof Error ? e.message : String(e),
	);

function enqueue<T>(url: string, fn: () => Promise<T>): Promise<T> {
	const prev = queues.get(url) ?? Promise.resolve();
	const run = prev.then(async () => {
		for (let attempt = 0; ; attempt++) {
			const wait = MIN_GAP_MS - (Date.now() - (lastAt.get(url) ?? 0));
			if (wait > 0) await sleep(wait);
			try {
				return await fn();
			} catch (e) {
				if (!isRateLimited(e) || attempt >= RETRIES) throw e;
				await sleep(1000 * 2 ** attempt);
			} finally {
				lastAt.set(url, Date.now());
			}
		}
	});

	queues.set(url, run.catch(() => undefined));
	return run;
}

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
	return enqueue(url, async () => {
		const res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
		});
		if (res.status === 429) throw new RateLimited();
		if (!res.ok) throw new Error(`EVM RPC ${res.status}`);
		const json = (await res.json()) as { result?: T; error?: { code?: number; message: string } };
		if (json.error) {
			if (json.error.code === -32016 || isRateLimited(json.error.message)) {
				throw new RateLimited();
			}
			throw new Error(json.error.message);
		}
		return json.result as T;
	});
}

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

const SIG_AGGREGATE3 = "0x82ad56cb";

type Call = { to: string; data: string };

export type CallResult = { success: boolean; data: string };

function encodeAggregate3(calls: Call[]): string {
	const structs = calls.map((c) => {
		const body = c.data.replace(/^0x/, "");
		const len = body.length / 2;

		const padded = body.padEnd(Math.ceil(len / 32) * 64, "0");

		return word(c.to) + word(1) + word(0x60) + word(len) + padded;
	});

	let cursor = calls.length * 32;
	const heads = structs.map((st) => {
		const head = word(cursor);
		cursor += st.length / 2;
		return head;
	});

	return (
		SIG_AGGREGATE3 + word(0x20) + word(calls.length) + heads.join("") + structs.join("")
	);
}

function decodeAggregate3(hex: string): CallResult[] {
	const body = hex.replace(/^0x/, "");
	const slot = (i: number) => BigInt("0x" + body.slice(i * 64, i * 64 + 64));

	const arr = Number(slot(0)) / 32;
	const n = Number(slot(arr));
	const base = arr + 1;

	const out: CallResult[] = [];
	for (let i = 0; i < n; i++) {
		const st = base + Number(slot(base + i)) / 32;
		const bytes = st + Number(slot(st + 1)) / 32;
		const len = Number(slot(bytes));
		out.push({
			success: slot(st) === 1n,
			data: "0x" + body.slice((bytes + 1) * 64, (bytes + 1) * 64 + len * 2),
		});
	}
	return out;
}

const ERROR_STRING = "08c379a0";

function revertReason(data: string): string | null {
	const body = data.replace(/^0x/, "");
	if (!body.startsWith(ERROR_STRING)) return null;
	const tail = body.slice(ERROR_STRING.length);
	const len = Number(BigInt("0x" + tail.slice(64, 128)));
	const chars = tail.slice(128, 128 + len * 2).match(/../g) ?? [];
	return new TextDecoder().decode(
		Uint8Array.from(chars.map((h) => parseInt(h, 16))),
	);
}

async function multicall(chain: ChainId, calls: Call[]): Promise<CallResult[]> {
	const hex = await rpc<string>(evmRpc(chain), "eth_call", [
		{ to: MULTICALL3, data: encodeAggregate3(calls) },
		"latest",
	]);

	if (!hex || hex === "0x") throw new Error(`No Multicall3 on ${chain}`);
	return decodeAggregate3(hex);
}

function take(results: CallResult[], i: number): bigint[] {
	const r = results[i];
	if (!r.success) throw new Error(revertReason(r.data) ?? "EVM call reverted");
	return words(r.data);
}

export type EvmPoolContracts = {
	chain: ChainId;
	vault: string;

	asset: string;

	trancheTokens: readonly string[];
};

export type EvmVaultState = {
	nav: bigint;
	values: [bigint, bigint, bigint];
	totalShares: [bigint, bigint, bigint];
};

export async function readVault(c: EvmPoolContracts): Promise<EvmVaultState> {
	const res = await multicall(c.chain, [
		{ to: c.vault, data: SIG.nav },
		{ to: c.vault, data: SIG.values },
		...[0, 1, 2].map((i) => ({ to: c.vault, data: encode(SIG.totalShares, i) })),
	]);

	const [nav] = take(res, 0);
	const vals = take(res, 1);
	return {
		nav,
		values: [vals[0], vals[1], vals[2]],
		totalShares: [0, 1, 2].map((i) => take(res, 2 + i)[0]) as [bigint, bigint, bigint],
	};
}

export type EvmWalletState = {
	balance: bigint;
	allowance: bigint;
	shares: [bigint, bigint, bigint];
	tickets: { shares: bigint; unlockAt: number }[];
};

export async function readWallet(c: EvmPoolContracts, owner: string): Promise<EvmWalletState> {
	const res = await multicall(c.chain, [
		{ to: c.asset, data: encode(SIG.balanceOf, owner) },
		{ to: c.asset, data: encode(SIG.allowance, owner, c.vault) },

		...[0, 1, 2].flatMap((i) => [
			{ to: c.trancheTokens[i], data: encode(SIG.balanceOf, owner) },
			{ to: c.vault, data: encode(SIG.tickets, owner, i) },
		]),
	]);

	const [balance] = take(res, 0);
	const [allowance] = take(res, 1);
	const shares: bigint[] = [];
	const tickets: { shares: bigint; unlockAt: number }[] = [];
	for (const i of [0, 1, 2]) {
		shares.push(take(res, 2 + i * 2)[0]);
		const t = take(res, 3 + i * 2);
		tickets.push({ shares: t[0], unlockAt: Number(t[1]) });
	}
	return { balance, allowance, shares: shares as [bigint, bigint, bigint], tickets };
}
