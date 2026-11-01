import type { ChainId } from "./chains.ts";
import { evmRpc, encode, word } from "./evm.ts";

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

	address: string;
	profile: Profile;

	label: string;

	asset: string;
	assetSymbol: string;
	assetDecimals: number;

	blendPct: readonly [number, number, number];
};

const envAddr = (key: string): string => {
	const v = (import.meta.env as Record<string, string | undefined>)[key];
	return typeof v === "string" ? v : "";
};

const BLENDS: Record<Profile, readonly [number, number, number]> = {
	conservative: [10, 20, 70],
	balanced: [20, 30, 50],
	aggressive: [50, 30, 20],
};

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

export const BASKETS: Basket[] = [

	...profilesOver("base", "NVDA", "0xb20000000000000000000078ee7ce2fE4908108C", "NVDA", 8, {
		conservative: envAddr("VITE_BASKET_BASE_NVDA_CONSERVATIVE") || "0x2Af7f66C3F00111A51F7B50161a66fF4242d9357",
		balanced: envAddr("VITE_BASKET_BASE_NVDA_BALANCED") || "0x7cfcc8fc421D54b1Af2D224C14e929521f63B6A6",
		aggressive: envAddr("VITE_BASKET_BASE_NVDA_AGGRESSIVE") || "0xfFF07484455d76af25Af163F3388Fea0b9E00e44",
	}),

	...profilesOver("base", "MSFT", "0xB200000000000000000000Ab99cFa739E253872B", "MSFT", 8, {
		conservative: envAddr("VITE_BASKET_BASE_MSFT_CONSERVATIVE") || "0xF316FF86000eae8808cEF565b24db1fdC2b70E33",
		balanced: envAddr("VITE_BASKET_BASE_MSFT_BALANCED") || "0xDc34F79b53f3b2b270A6208C35400435CE7cde43",
		aggressive: envAddr("VITE_BASKET_BASE_MSFT_AGGRESSIVE") || "0x22744563380F77EbCB4941626c16165f0446A5D5",
	}),

	...profilesOver("arbitrum", "WETH", "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", "WETH", 18, {
		conservative: envAddr("VITE_BASKET_ARB_WETH_CONSERVATIVE"),
		balanced: envAddr("VITE_BASKET_ARB_WETH_BALANCED"),
		aggressive: envAddr("VITE_BASKET_ARB_WETH_AGGRESSIVE"),
	}),
];

export function basketsOfChain(chain: ChainId): Basket[] {
	return BASKETS.filter((b) => b.chain === chain && b.address !== "");
}

export function chainHasBaskets(chain: ChainId): boolean {
	return basketsOfChain(chain).length > 0;
}

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
	sharePrice: bigint;

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
	shares: bigint;

	assetBalance: bigint;

	allowance: bigint;
};

export async function readBasketWallet(b: Basket, owner: string): Promise<BasketWalletState> {
	const [shares] = await ethCall(b.chain, b.address, encode(SIG.balanceOf, owner));
	const [assetBalance] = await ethCall(b.chain, b.asset, encode(SIG.balanceOf, owner));
	const [allowance] = await ethCall(b.chain, b.asset, encode(SIG.allowance, owner, b.address));
	return { shares, assetBalance, allowance };
}

const MAX_UINT = (1n << 256n) - 1n;

export function encodeApprove(b: Basket): { to: string; data: string } {
	return { to: b.asset, data: encode(SIG.approve, b.address, MAX_UINT) };
}

export function encodeDeposit(b: Basket, amount: bigint): { to: string; data: string } {
	return { to: b.address, data: SIG.deposit + word(amount) };
}

export function encodeRedeem(b: Basket, shares: bigint): { to: string; data: string } {
	return { to: b.address, data: SIG.redeem + word(shares) };
}
