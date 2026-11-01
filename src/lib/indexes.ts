import type { ChainId } from "./chains.ts";
import { evmRpc, encode, word } from "./evm.ts";

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

export type IndexLeg = {
	asset: string;
	assetSymbol: string;
	assetDecimals: number;

	tranche: "Senior" | "Middle" | "Junior";
};

export type IndexBasket = {
	chain: ChainId;

	address: string;

	label: string;

	symbol: string;
	legs: IndexLeg[];
};

const envAddr = (key: string): string => {
	const v = (import.meta.env as Record<string, string | undefined>)[key];
	return typeof v === "string" ? v : "";
};

export const INDEXES: IndexBasket[] = [

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

export function indexesOfChain(chain: ChainId): IndexBasket[] {
	return INDEXES.filter((x) => x.chain === chain && x.address !== "");
}

export function chainHasIndexes(chain: ChainId): boolean {
	return indexesOfChain(chain).length > 0;
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

export type IndexState = {
	sharePrice: bigint;

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
	shares: bigint;

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

const MAX_UINT = (1n << 256n) - 1n;

export function encodeApproveLeg(x: IndexBasket, legIndex: number): { to: string; data: string } {
	return { to: x.legs[legIndex].asset, data: encode(SIG.approve, x.address, MAX_UINT) };
}

export function encodeDeposit(x: IndexBasket, amounts: bigint[]): { to: string; data: string } {
	const head = word(32);
	const len = word(amounts.length);
	const body = amounts.map(word).join("");
	return { to: x.address, data: SIG.deposit + head + len + body };
}

export function encodeRedeem(x: IndexBasket, shares: bigint): { to: string; data: string } {
	return { to: x.address, data: SIG.redeem + word(shares) };
}
