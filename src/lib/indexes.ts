import type { ChainId } from "./chains.ts";
import { evmRpc, encode, word } from "./evm.ts";

/**
 * Diversified index baskets (IndexBasket) on the EVM chains.
 *
 * Where a one-click profile (SingleAssetBasket) blends the three tranches of
 * ONE asset, an index holds ONE tranche across SEVERAL assets — the canonical
 * use being senior (Shield) over, say, MSFT and NVDA on Base: one token,
 * protected yield spread across more than a single name.
 *
 * DEPOSIT is per leg: the legs hold different assets, so you bring an amount of
 * each (zero to skip a leg) and index shares are minted against the value
 * actually added. EXIT is redemption in kind — a pro-rata slice of every
 * tranche token the index holds, instant and with no vault window.
 *
 * Reads and transactions are built by hand, mirroring evm.ts / baskets.ts.
 *
 * ADDRESSES. Indexes are deployed with DeployIndex.s.sol. Until an address is
 * filled in (here or via the VITE_* env override), that index is simply hidden.
 */

/** IndexBasket selectors (keccak of the signature, first 4 bytes). */
const SIG = {
	sharePrice: "0x87269729", // sharePrice()
	totalValueUsd: "0x7f05a730", // totalValueUsd()
	totalSupply: "0x18160ddd", // totalSupply()
	deposit: "0x598b8e71", // deposit(uint256[])
	redeem: "0xdb006a75", // redeem(uint256)
	balanceOf: "0x70a08231", // balanceOf(address)
	allowance: "0xdd62ed3e", // allowance(address,address)
	approve: "0x095ea7b3", // approve(address,uint256)
} as const;

/** One leg of an index: an asset routed into one tranche of its own vault. */
export type IndexLeg = {
	/** The leg's underlying asset — what a depositor brings in for this leg. */
	asset: string;
	assetSymbol: string;
	assetDecimals: number;
	/** Which tranche the leg holds, for display. */
	tranche: "Senior" | "Middle" | "Junior";
};

export type IndexBasket = {
	chain: ChainId;
	/** The deployed IndexBasket address. Empty = not deployed, hidden. */
	address: string;
	/** Human label, e.g. "Shield Index · MSFT + NVDA". */
	label: string;
	/** The index share symbol, e.g. "rSHLD". */
	symbol: string;
	legs: IndexLeg[];
};

const envAddr = (key: string): string => {
	const v = (import.meta.env as Record<string, string | undefined>)[key];
	return typeof v === "string" ? v : "";
};

/**
 * The index registry. Addresses are blank until the index is deployed; paste
 * the DeployIndex output here, or set the VITE_* env var. Any index with an
 * empty address is hidden, so the live app is unaffected until then.
 */
export const INDEXES: IndexBasket[] = [
	// Base · Shield Index — senior across MSFT and NVDA.
	// Deploy: VAULTS=<msft>,<nvda> TRANCHES=2,2 INDEX_NAME="Resu Shield Index"
	//         INDEX_SYMBOL=rSHLD forge script script/DeployIndex.s.sol ...
	{
		chain: "base",
		address: envAddr("VITE_INDEX_BASE_SHIELD") || "0x5BFfd03ab2EFf2905b846697A18e7173Af1d3aA7",
		label: "Shield Index · MSFT + NVDA",
		symbol: "rSHLD",
		legs: [
			{
				asset: "0xB200000000000000000000Ab99cFa739E253872B",
				assetSymbol: "MSFT",
				assetDecimals: 8,
				tranche: "Senior",
			},
			{
				asset: "0xb20000000000000000000078ee7ce2fE4908108C",
				assetSymbol: "NVDA",
				assetDecimals: 8,
				tranche: "Senior",
			},
		],
	},
];

/** Deployed indexes on a chain (those with an address set). */
export function indexesOfChain(chain: ChainId): IndexBasket[] {
	return INDEXES.filter((x) => x.chain === chain && x.address !== "");
}

export function chainHasIndexes(chain: ChainId): boolean {
	return indexesOfChain(chain).length > 0;
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

export type IndexState = {
	/** Wad USD value of one 1e18 index shares. */
	sharePrice: bigint;
	/** Total wad USD value the index holds. */
	totalValueUsd: bigint;
	totalSupply: bigint;
};

export async function readIndex(x: IndexBasket): Promise<IndexState> {
	const [sharePrice] = await ethCall(x.chain, x.address, SIG.sharePrice);
	const [totalValueUsd] = await ethCall(x.chain, x.address, SIG.totalValueUsd);
	const [totalSupply] = await ethCall(x.chain, x.address, SIG.totalSupply);
	return { sharePrice, totalValueUsd, totalSupply };
}

export type IndexWalletState = {
	/** The holder's index shares (18 decimals). */
	shares: bigint;
	/** Per-leg: the holder's balance of the leg asset, and the index allowance. */
	legs: { assetBalance: bigint; allowance: bigint }[];
};

export async function readIndexWallet(x: IndexBasket, owner: string): Promise<IndexWalletState> {
	const [shares] = await ethCall(x.chain, x.address, encode(SIG.balanceOf, owner));
	const legs = await Promise.all(
		x.legs.map(async (leg) => {
			const [assetBalance] = await ethCall(x.chain, leg.asset, encode(SIG.balanceOf, owner));
			const [allowance] = await ethCall(x.chain, leg.asset, encode(SIG.allowance, owner, x.address));
			return { assetBalance, allowance };
		}),
	);
	return { shares, legs };
}

// --- Transaction data (pass to wallet.send(to, data)) ----------------------

const MAX_UINT = (1n << 256n) - 1n;

/** Approve the index to pull one leg's asset. to = that leg's asset token. */
export function encodeApproveLeg(x: IndexBasket, legIndex: number): { to: string; data: string } {
	return { to: x.legs[legIndex].asset, data: encode(SIG.approve, x.address, MAX_UINT) };
}

/**
 * Deposit per-leg amounts into the index. to = the index.
 *
 * deposit(uint256[]) is one dynamic array, ABI-encoded by hand since evm.ts's
 * encode() only lays down fixed 32-byte words: head is the offset to the array
 * (0x20), then its length, then each element.
 */
export function encodeDeposit(x: IndexBasket, amounts: bigint[]): { to: string; data: string } {
	const head = word(32); // offset to the array data
	const len = word(amounts.length);
	const body = amounts.map(word).join("");
	return { to: x.address, data: SIG.deposit + head + len + body };
}

/** Redeem index shares in kind (pro-rata tranche tokens). to = the index. */
export function encodeRedeem(x: IndexBasket, shares: bigint): { to: string; data: string } {
	return { to: x.address, data: SIG.redeem + word(shares) };
}
