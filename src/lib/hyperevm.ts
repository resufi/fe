import type { Mandate } from "./config.ts";
import { env } from "./env.ts";

/**
 * Reading the pool on HyperEVM.
 *
 * Calls are built by hand, without viem or ethers. The reason is the same as in
 * solana.ts: we only need to read a dozen fixed-shape functions, and a
 * library would add hundreds of kilobytes for encoding that fits here
 * in two pages.
 *
 * The layout is defined in resu-sc-hyperevm/src/ResuVault.sol — if it changes,
 * update it here.
 */

export const HYPEREVM = {
	chainId: 999,
	chainIdHex: "0x3e7",
	name: "HyperEVM",
	rpc: "https://rpc.hyperliquid.xyz/evm",
	explorer: "https://hyperevm-explorer.vercel.app",
	/** The chain's native coin: it pays for gas. */
	nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
} as const;

export const CONTRACTS = {
	vault: "0x53F7e94a0edd3CFb958332842ec1fEce566f941d",
	/** USDC on HyperEVM. Six decimals, same as on Core. */
	asset: "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
	hlp: "0xdfc24b077bc1425AD1DEA75bCB6f8158E10Df303",
	/**
	 * Share tokens, junior -> senior. The order is verified against the pool via
	 * trancheTokens(i): the labels in the deploy summary are mixed up and can't
	 * be trusted.
	 */
	trancheTokens: [
		"0x57b6114b9Ad77ad6F1c2a90413ce735eAa1537Bd", // jrHLP
		"0x65107E1896474946baC14f2849D830725E0288CD", // mlHLP
		"0x9E366c12208995667a2C248CbBA4cABDf28B50Fb", // srHLP
	],
} as const;

/** Selectors. Obtained with cast sig; change only together with the contract. */
export const SIG = {
	nav: "0xc1590cd7",
	values: "0x971217b7",
	sharePrice: "0x61a9da23",
	coreBalance: "0x7499aff4",
	inTransit: "0xcaf173bc",
	hlpLockedUntil: "0x6a22fa4e",
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

const endpoint = () => env("VITE_HYPEREVM_RPC") ?? HYPEREVM.rpc;

let nextId = 1;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
	const res = await fetch(endpoint(), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
	});
	if (!res.ok) throw new Error(`HyperEVM RPC ${res.status}`);
	const json = (await res.json()) as { result?: T; error?: { message: string } };
	if (json.error) throw new Error(json.error.message);
	return json.result as T;
}

/** An ABI word: 32 bytes, right-aligned. */
export const word = (v: bigint | number | string): string => {
	if (typeof v === "string") return v.toLowerCase().replace(/^0x/, "").padStart(64, "0");
	return BigInt(v).toString(16).padStart(64, "0");
};

export const encode = (selector: string, ...args: (bigint | number | string)[]): string =>
	selector + args.map(word).join("");

/** Parsing a response into 32-byte words. */
const words = (hex: string): bigint[] => {
	const body = hex.replace(/^0x/, "");
	const out: bigint[] = [];
	for (let i = 0; i + 64 <= body.length; i += 64) {
		out.push(BigInt("0x" + body.slice(i, i + 64)));
	}
	return out;
};

async function call(to: string, data: string): Promise<bigint[]> {
	return words(await rpc<string>("eth_call", [{ to, data }, "latest"]));
}

export type EvmVaultState = {
	/** The pool's total value: HLP plus Core plus buffer plus in-flight. */
	nav: bigint;
	/** How it splits across tranches, junior -> senior. */
	values: [bigint, bigint, bigint];
	totalShares: [bigint, bigint, bigint];
	/** Senior and mezzanine claims. Junior has none — it is the residual. */
	claims: [bigint, bigint, bigint];
	coreBalance: bigint;
	inTransit: bigint;
	hlpLockedUntil: number;
};

export async function readVault(): Promise<EvmVaultState> {
	const V = CONTRACTS.vault;
	// Sequentially, not in a burst: a public node rate-limits, and
	// a batch of parallel requests comes back as rejections, not data.
	const [nav] = await call(V, SIG.nav);
	const vals = await call(V, SIG.values);
	const shares: bigint[] = [];
	const claims: bigint[] = [];
	for (const i of [0, 1, 2]) {
		shares.push((await call(V, encode(SIG.totalShares, i)))[0]);
		claims.push((await call(V, encode(SIG.claims, i)))[0]);
	}
	const [core] = await call(V, SIG.coreBalance);
	const [transit] = await call(V, SIG.inTransit);
	const [locked] = await call(V, SIG.hlpLockedUntil);

	return {
		nav,
		values: [vals[0], vals[1], vals[2]] as [bigint, bigint, bigint],
		totalShares: shares as [bigint, bigint, bigint],
		claims: claims as [bigint, bigint, bigint],
		coreBalance: core,
		inTransit: transit,
		hlpLockedUntil: Number(locked),
	};
}

export type EvmWalletState = {
	/** The owner's USDC balance. */
	balance: bigint;
	/** How much the owner allowed the pool to spend. */
	allowance: bigint;
	shares: [bigint, bigint, bigint];
	tickets: { shares: bigint; unlockAt: number }[];
};

export async function readWallet(owner: string): Promise<EvmWalletState> {
	const [balance] = await call(CONTRACTS.asset, encode(SIG.balanceOf, owner));
	const [allowance] = await call(
		CONTRACTS.asset,
		encode(SIG.allowance, owner, CONTRACTS.vault),
	);

	// Held shares live in the tranche token, not the pool: with ERC20
	// the pool stopped keeping its own list of holders. Exit tickets
	// stayed on the pool — that's where they live.
	const shares: bigint[] = [];
	const tickets: { shares: bigint; unlockAt: number }[] = [];
	for (const i of [0, 1, 2]) {
		shares.push(
			(await call(CONTRACTS.trancheTokens[i], encode(SIG.balanceOf, owner)))[0],
		);
		const t = await call(CONTRACTS.vault, encode(SIG.tickets, owner, i));
		tickets.push({ shares: t[0], unlockAt: Number(t[1]) });
	}

	return {
		balance,
		allowance,
		shares: shares as [bigint, bigint, bigint],
		tickets,
	};
}

/**
 * The pool mandate. Set at deployment and never changes — no need to read it.
 *
 * There is no loss ceiling here: shares are re-derived from NAV on every read,
 * not written off by events, so there is nothing to cap. A protection fee
 * is also absent — instead there are coupons that senior and mezzanine
 * earn, not pay.
 */
export const MANDATE: Mandate = {
	maxLossBps: 0,
	withdrawDelay: 86400,
	seniorFeeBps: 0,
	seniorFeeToMezzBps: 0,
	mezzFeeBps: 0,
	seniorRateBps: 600,
	mezzRateBps: 1200,
	minDeposit: "1000000",
};
