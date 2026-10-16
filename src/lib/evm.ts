import { env } from "./env.ts";
import type { ChainId } from "./chains.ts";

/**
 * A shared layer for all of Resu's EVM chains: HyperEVM, Robinhood, Arbitrum.
 *
 * Calls are built by hand, without viem or ethers — the same reason as in
 * solana.ts: we only need to read a dozen fixed-shape functions, and a
 * library would add hundreds of kilobytes. The chains differ only by addresses
 * and node; the reading logic is one.
 *
 * The coupon contract (OracleVault on Robinhood/Arbitrum) and the HLP contract
 * (ResuVault on HyperEVM) share the same read signatures — nav/values/
 * totalShares/claims/tickets — so one reader serves both.
 */

export type EvmChainParams = {
	chainId: number;
	chainIdHex: string;
	name: string;
	rpc: string;
	/** Env variable overriding the node (a public one can be slow). */
	rpcEnv?: string;
	explorer: string;
	nativeCurrency: { name: string; symbol: string; decimals: number };
};

/** EVM chain params. The key matches the app's ChainId. */
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

/** Selectors. Shared by ResuVault and OracleVault — the signatures match. */
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

/** An ABI word: 32 bytes, right-aligned. */
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

/**
 * A rate-limited node answers a burst with rejections, not data.
 *
 * `mainnet.base.org` lets about eight requests through back to back and then
 * returns 429 for the rest — a full pool pass used to need thirteen, so the
 * tail of every refresh arrived as errors. Two things fix that: the pass is
 * now one `eth_call` (see `multicall`), and whatever is left goes through this
 * queue, one request at a time with a gap between them.
 *
 * Shaped after `enqueue` in chain.ts, which does the same for toncenter. Kept
 * per node: the chains have separate limits and must not wait on each other.
 */
const MIN_GAP_MS = 250;

const RETRIES = 4;

const queues = new Map<string, Promise<unknown>>();
const lastAt = new Map<string, number>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The node refused the pace, not the call — worth repeating. */
class RateLimited extends Error {
	constructor() {
		super("EVM RPC 429");
		this.name = "RateLimited";
	}
}

/*
 * A limit shows up in two shapes: as HTTP 429, and — inside a batch, where the
 * envelope is 200 — as a JSON-RPC error. Base sends -32016 "over rate limit";
 * other nodes word it their own way, so the message is checked too.
 */
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

/**
 * Multicall3 — the same address on every EVM chain, Base included.
 *
 * Batching plain JSON-RPC does not help: the node counts calls, not requests.
 * Base refuses a batch of thirteen outright ("maximum 10 calls in 1 batch"),
 * and inside a batch of ten half the calls come back with "over rate limit" —
 * under HTTP 200, where a status check cannot see them. For the node a
 * multicall is one call, so this is the only batching that actually counts.
 */
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

/** aggregate3((address,bool,bytes)[]) */
const SIG_AGGREGATE3 = "0x82ad56cb";

type Call = { to: string; data: string };

export type CallResult = { success: boolean; data: string };

function encodeAggregate3(calls: Call[]): string {
	const structs = calls.map((c) => {
		const body = c.data.replace(/^0x/, "");
		const len = body.length / 2;
		// Dynamic bytes are padded to a whole number of words.
		const padded = body.padEnd(Math.ceil(len / 32) * 64, "0");
		// target, allowFailure, offset of the bytes inside the struct.
		return word(c.to) + word(1) + word(0x60) + word(len) + padded;
	});

	// Heads hold each struct's offset from the start of the array's data.
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

/** Error(string) — how a `require` reaches us through a failed multicall. */
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

/**
 * Every read of one pass in a single request.
 *
 * `allowFailure` is on for all of them: on coupon stock pools `nav()` reverts
 * with "stale price" while the market is closed, and that is a state to show,
 * not a reason to lose the rest of the numbers. The reverting call is rethrown
 * with its own reason so the caller can tell the two apart.
 */
async function multicall(chain: ChainId, calls: Call[]): Promise<CallResult[]> {
	const hex = await rpc<string>(evmRpc(chain), "eth_call", [
		{ to: MULTICALL3, data: encodeAggregate3(calls) },
		"latest",
	]);
	/*
	 * An address with no code answers with empty data, and the decoder would
	 * fail on it with something unreadable. All five of our chains have
	 * Multicall3 at the canonical address — this is for the sixth.
	 */
	if (!hex || hex === "0x") throw new Error(`No Multicall3 on ${chain}`);
	return decodeAggregate3(hex);
}

function take(results: CallResult[], i: number): bigint[] {
	const r = results[i];
	if (!r.success) throw new Error(revertReason(r.data) ?? "EVM call reverted");
	return words(r.data);
}

/** A pool's addresses on an EVM chain. */
export type EvmPoolContracts = {
	chain: ChainId;
	vault: string;
	/** The base asset deposited (USDC on HLP, the SPY token on Robinhood). */
	asset: string;
	/** Share tokens, junior -> senior. */
	trancheTokens: readonly string[];
};

export type EvmVaultState = {
	nav: bigint;
	values: [bigint, bigint, bigint];
	totalShares: [bigint, bigint, bigint];
};

/**
 * Pool state: five reads in one request.
 *
 * It used to be five requests in a row, and together with the wallet pass that
 * made thirteen — more than a public node lets through back to back.
 */
export async function readVault(c: EvmPoolContracts): Promise<EvmVaultState> {
	const res = await multicall(c.chain, [
		{ to: c.vault, data: SIG.nav },
		{ to: c.vault, data: SIG.values },
		...[0, 1, 2].map((i) => ({ to: c.vault, data: encode(SIG.totalShares, i) })),
	]);

	// nav() first and on its own: its "stale price" revert is the signal the
	// caller watches for, and it must not be shadowed by a later failure.
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

/** Wallet state: eight reads in one request. */
export async function readWallet(c: EvmPoolContracts, owner: string): Promise<EvmWalletState> {
	const res = await multicall(c.chain, [
		{ to: c.asset, data: encode(SIG.balanceOf, owner) },
		{ to: c.asset, data: encode(SIG.allowance, owner, c.vault) },
		// Held shares live in the tranche token, not the pool. Exit tickets —
		// live on the pool.
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
