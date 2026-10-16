import type { ChainId } from "./chains.ts";
import { evmRpc, encode, word } from "./evm.ts";

/**
 * One-click risk profiles (SingleAssetBasket) on the EVM chains.
 *
 * A basket wraps ONE OracleVault and holds a fixed blend of its three tranches,
 * handing back a single token. "Conservative" leans on Senior, "Aggressive" on
 * Junior. Deposit is one asset in; exit is redemption in kind (a pro-rata slice
 * of every tranche token the basket holds), so it is instant and needs no
 * vault exit window.
 *
 * Reads and transactions are built by hand, mirroring evm.ts — we only need a
 * handful of fixed-shape calls, and a library would add hundreds of kilobytes.
 *
 * ADDRESSES. Baskets are deployed per vault with DeployBaskets.s.sol. Until an
 * address is filled in (here or via the VITE_* env override), that profile is
 * simply hidden — the panel renders nothing, so the live app is unaffected.
 */

/** Basket function selectors (keccak of the signature, first 4 bytes). */
const SIG = {
	sharePrice: "0x87269729", // sharePrice()
	totalValueUsd: "0x7f05a730", // totalValueUsd()
	totalSupply: "0x18160ddd", // totalSupply()
	deposit: "0xb6b55f25", // deposit(uint256)
	redeem: "0xdb006a75", // redeem(uint256)
	balanceOf: "0x70a08231", // balanceOf(address)
	allowance: "0xdd62ed3e", // allowance(address,address)
	approve: "0x095ea7b3", // approve(address,uint256)
} as const;

export type Profile = "conservative" | "balanced" | "aggressive";

export type Basket = {
	chain: ChainId;
	/** The deployed SingleAssetBasket address. Empty = not deployed, hidden. */
	address: string;
	profile: Profile;
	/** Human label, e.g. "Conservative · NVDA". */
	label: string;
	/** The underlying vault's asset — what a depositor brings in. */
	asset: string;
	assetSymbol: string;
	assetDecimals: number;
	/** Blend shown to the user: [junior, middle, senior] in %. */
	blendPct: readonly [number, number, number];
};

const envAddr = (key: string): string => {
	const v = (import.meta.env as Record<string, string | undefined>)[key];
	return typeof v === "string" ? v : "";
};

// Fixed blends from DeployBaskets.s.sol: [junior, middle, senior].
const BLENDS: Record<Profile, readonly [number, number, number]> = {
	conservative: [10, 20, 70],
	balanced: [20, 30, 50],
	aggressive: [50, 30, 20],
};

/**
 * Build the three profiles over one vault. Fill the three addresses (from the
 * DeployBaskets run) or set the matching VITE_* env vars.
 */
function profilesOver(
	chain: ChainId,
	ticker: string,
	asset: string,
	assetSymbol: string,
	assetDecimals: number,
	addrs: Record<Profile, string>,
): Basket[] {
	return (Object.keys(BLENDS) as Profile[]).map((profile) => ({
		chain,
		address: addrs[profile],
		profile,
		label: `${profile[0].toUpperCase()}${profile.slice(1)} · ${ticker}`,
		asset,
		assetSymbol,
		assetDecimals,
		blendPct: BLENDS[profile],
	}));
}

/**
 * The basket registry. Addresses are blank until the baskets are deployed;
 * paste the DeployBaskets output here, or set the VITE_* env vars. Any basket
 * with an empty address is hidden.
 */
export const BASKETS: Basket[] = [
	// Base · NVDA (asset NVDAc, 8 decimals).
	...profilesOver("base", "NVDA", "0xb20000000000000000000078ee7ce2fE4908108C", "NVDA", 8, {
		conservative: envAddr("VITE_BASKET_BASE_NVDA_CONSERVATIVE") || "0x2Af7f66C3F00111A51F7B50161a66fF4242d9357",
		balanced: envAddr("VITE_BASKET_BASE_NVDA_BALANCED") || "0x7cfcc8fc421D54b1Af2D224C14e929521f63B6A6",
		aggressive: envAddr("VITE_BASKET_BASE_NVDA_AGGRESSIVE") || "0xfFF07484455d76af25Af163F3388Fea0b9E00e44",
	}),
	// Base · MSFT (asset MSFTc, 8 decimals).
	...profilesOver("base", "MSFT", "0xB200000000000000000000Ab99cFa739E253872B", "MSFT", 8, {
		conservative: envAddr("VITE_BASKET_BASE_MSFT_CONSERVATIVE") || "0xF316FF86000eae8808cEF565b24db1fdC2b70E33",
		balanced: envAddr("VITE_BASKET_BASE_MSFT_BALANCED") || "0xDc34F79b53f3b2b270A6208C35400435CE7cde43",
		aggressive: envAddr("VITE_BASKET_BASE_MSFT_AGGRESSIVE") || "0x22744563380F77EbCB4941626c16165f0446A5D5",
	}),
	// Arbitrum · WETH (18 decimals).
	...profilesOver("arbitrum", "WETH", "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", "WETH", 18, {
		conservative: envAddr("VITE_BASKET_ARB_WETH_CONSERVATIVE"),
		balanced: envAddr("VITE_BASKET_ARB_WETH_BALANCED"),
		aggressive: envAddr("VITE_BASKET_ARB_WETH_AGGRESSIVE"),
	}),
];

/** Deployed baskets on a chain (those with an address set). */
export function basketsOfChain(chain: ChainId): Basket[] {
	return BASKETS.filter((b) => b.chain === chain && b.address !== "");
}

export function chainHasBaskets(chain: ChainId): boolean {
	return basketsOfChain(chain).length > 0;
}

// --- Reads -----------------------------------------------------------------

let nextId = 1;

async function ethCall(chain: ChainId, to: string, data: string): Promise<bigint[]> {
	const res = await fetch(evmRpc(chain), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: nextId++,
			method: "eth_call",
			params: [{ to, data }, "latest"],
		}),
	});
	if (!res.ok) throw new Error(`EVM RPC ${res.status}`);
	const json = (await res.json()) as { result?: string; error?: { message: string } };
	if (json.error) throw new Error(json.error.message);
	const body = (json.result ?? "0x").replace(/^0x/, "");
	const out: bigint[] = [];
	for (let i = 0; i + 64 <= body.length; i += 64) out.push(BigInt("0x" + body.slice(i, i + 64)));
	return out;
}

export type BasketState = {
	/** Wad USD value of one 1e18 basket shares. */
	sharePrice: bigint;
	/** Total wad USD value the basket holds. */
	totalValueUsd: bigint;
	totalSupply: bigint;
};

export async function readBasket(b: Basket): Promise<BasketState> {
	const [sharePrice] = await ethCall(b.chain, b.address, SIG.sharePrice);
	const [totalValueUsd] = await ethCall(b.chain, b.address, SIG.totalValueUsd);
	const [totalSupply] = await ethCall(b.chain, b.address, SIG.totalSupply);
	return { sharePrice, totalValueUsd, totalSupply };
}

export type BasketWalletState = {
	/** The holder's basket shares (18 decimals). */
	shares: bigint;
	/** The holder's balance of the underlying asset. */
	assetBalance: bigint;
	/** How much the basket may pull of the asset. */
	allowance: bigint;
};

export async function readBasketWallet(b: Basket, owner: string): Promise<BasketWalletState> {
	const [shares] = await ethCall(b.chain, b.address, encode(SIG.balanceOf, owner));
	const [assetBalance] = await ethCall(b.chain, b.asset, encode(SIG.balanceOf, owner));
	const [allowance] = await ethCall(b.chain, b.asset, encode(SIG.allowance, owner, b.address));
	return { shares, assetBalance, allowance };
}

// --- Transaction data (pass to wallet.send(to, data)) ----------------------

const MAX_UINT = (1n << 256n) - 1n;

/** Approve the basket to pull the underlying asset. to = the asset token. */
export function encodeApprove(b: Basket): { to: string; data: string } {
	return { to: b.asset, data: encode(SIG.approve, b.address, MAX_UINT) };
}

/** Deposit the underlying asset into the basket. to = the basket. */
export function encodeDeposit(b: Basket, amount: bigint): { to: string; data: string } {
	return { to: b.address, data: SIG.deposit + word(amount) };
}

/** Redeem basket shares in kind (pro-rata tranche tokens). to = the basket. */
export function encodeRedeem(b: Basket, shares: bigint): { to: string; data: string } {
	return { to: b.address, data: SIG.redeem + word(shares) };
}
