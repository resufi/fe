import type { ChainId } from "./chains.ts";
import { evmChain, evmRpc, encode } from "./evm.ts";

const USDC: Partial<Record<ChainId, { address: string; decimals: number }>> = {
	base: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
	arbitrum: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
};

const SIG = {
	balanceOf: "0x70a08231", // balanceOf(address)
	allowance: "0xdd62ed3e", // allowance(address,address)
	approve: "0x095ea7b3", // approve(address,uint256)
} as const;

const MAX_UINT = (1n << 256n) - 1n;

export function zapSupported(chain: ChainId): boolean {
	return Boolean(USDC[chain]);
}

export function usdcOf(chain: ChainId): { address: string; decimals: number } | undefined {
	return USDC[chain];
}

export type ZapQuote = {
	buyAmount: bigint;

	minBuyAmount: bigint;

	to: string;
	data: string;

	approvalAddress: string;

	ok: boolean;
};

type LifiResponse = {
	estimate?: { toAmount?: string; toAmountMin?: string; approvalAddress?: string };
	transactionRequest?: { to?: string; data?: string; value?: string };
	message?: string;
};

export async function quoteUsdcToAsset(
	chain: ChainId,
	buyToken: string,
	sellAmount: bigint,
	taker: string,
): Promise<ZapQuote> {
	const usdc = USDC[chain];
	if (!usdc) throw new Error("USDC not configured on this chain");

	const id = String(evmChain(chain).chainId);
	const params = new URLSearchParams({
		fromChain: id,
		toChain: id,
		fromToken: usdc.address,
		toToken: buyToken,
		fromAmount: sellAmount.toString(),
		fromAddress: taker,
		integrator: "resu",
	});
	const res = await fetch(`https://li.quest/v1/quote?${params}`);
	const empty: ZapQuote = {
		buyAmount: 0n,
		minBuyAmount: 0n,
		to: "",
		data: "",
		approvalAddress: "",
		ok: false,
	};

	if (res.status === 404) return empty;
	if (!res.ok) throw new Error(`LI.FI ${res.status}`);
	const j = (await res.json()) as LifiResponse;
	if (!j.transactionRequest?.to || !j.transactionRequest.data || !j.estimate?.approvalAddress) {
		return empty;
	}
	return {
		buyAmount: BigInt(j.estimate.toAmount ?? "0"),
		minBuyAmount: BigInt(j.estimate.toAmountMin ?? "0"),
		to: j.transactionRequest.to,
		data: j.transactionRequest.data,
		approvalAddress: j.estimate.approvalAddress,
		ok: true,
	};
}

let nextId = 1;

async function ethCall(chain: ChainId, to: string, data: string): Promise<bigint> {
	const res = await fetch(evmRpc(chain), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method: "eth_call", params: [{ to, data }, "latest"] }),
	});
	if (!res.ok) throw new Error(`EVM RPC ${res.status}`);
	const json = (await res.json()) as { result?: string; error?: { message: string } };
	if (json.error) throw new Error(json.error.message);
	return BigInt(json.result ?? "0x0");
}

export function readUsdcBalance(chain: ChainId, owner: string): Promise<bigint> {
	const usdc = USDC[chain]!;
	return ethCall(chain, usdc.address, encode(SIG.balanceOf, owner));
}

export function readUsdcAllowance(chain: ChainId, owner: string, spender: string): Promise<bigint> {
	const usdc = USDC[chain]!;
	return ethCall(chain, usdc.address, encode(SIG.allowance, owner, spender));
}

export function readTokenBalance(chain: ChainId, token: string, owner: string): Promise<bigint> {
	return ethCall(chain, token, encode(SIG.balanceOf, owner));
}

export function encodeApproveUsdc(chain: ChainId, spender: string): { to: string; data: string } {
	const usdc = USDC[chain]!;
	return { to: usdc.address, data: encode(SIG.approve, spender, MAX_UINT) };
}
