import type { ChainId } from "./chains.ts";
import { evmChain, evmRpc, encode } from "./evm.ts";

/**
 * Zap: deposit a basket or index starting from USDC.
 *
 * The underlying of our EVM baskets is not USDC — it is a tokenized stock
 * (NVDAc/MSFTc, which retail cannot mint, only trade) or WETH. So a zap turns
 * USDC into the underlying on a DEX, then the ordinary deposit runs. We route
 * the swap through the LI.FI API, which aggregates Base liquidity, routes the
 * B20 stock tokens (verified live), returns ready calldata and a min-received
 * after slippage — and needs no API key. The contracts stay swap-free; all
 * swap logic lives here on the client.
 *
 * Because the swap has slippage, we never deposit the quote: after the swap we
 * read the actual underlying balance received and deposit that.
 *
 * LI.FI returns `estimate.approvalAddress` (the router to approve USDC to) but
 * not whether the allowance already suffices, so the caller checks the USDC
 * allowance against that address itself (readUsdcAllowance).
 */

/** Native USDC per chain — what a zap sells. */
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

/** The chain can be zapped: it has a USDC address. (LI.FI needs no key.) */
export function zapSupported(chain: ChainId): boolean {
	return Boolean(USDC[chain]);
}

export function usdcOf(chain: ChainId): { address: string; decimals: number } | undefined {
	return USDC[chain];
}

// --- LI.FI quote -----------------------------------------------------------

export type ZapQuote = {
	/** Expected underlying out (in the buy token's own decimals). */
	buyAmount: bigint;
	/** Guaranteed minimum out after slippage — what the user is promised. */
	minBuyAmount: bigint;
	/** The swap transaction to send (to, data). value is 0 for an ERC20 sell. */
	to: string;
	data: string;
	/** The USDC spender (LI.FI router) the caller must approve. */
	approvalAddress: string;
	/** True when LI.FI could route the pair (liquidity exists). */
	ok: boolean;
};

type LifiResponse = {
	estimate?: { toAmount?: string; toAmountMin?: string; approvalAddress?: string };
	transactionRequest?: { to?: string; data?: string; value?: string };
	message?: string;
};

/**
 * Quote USDC -> `buyToken` for `sellAmount` USDC (in USDC's 6 decimals), for
 * `taker`. Throws on a network error; returns ok:false when LI.FI has no route.
 */
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
	// LI.FI returns 404 with a message when no route exists — not a hard error.
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

// --- USDC reads / approve --------------------------------------------------

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

/** The owner's USDC balance. */
export function readUsdcBalance(chain: ChainId, owner: string): Promise<bigint> {
	const usdc = USDC[chain]!;
	return ethCall(chain, usdc.address, encode(SIG.balanceOf, owner));
}

/** How much USDC `spender` (the LI.FI router) may pull from the owner. */
export function readUsdcAllowance(chain: ChainId, owner: string, spender: string): Promise<bigint> {
	const usdc = USDC[chain]!;
	return ethCall(chain, usdc.address, encode(SIG.allowance, owner, spender));
}

/** Read one ERC20 balance (used to read the underlying actually received). */
export function readTokenBalance(chain: ChainId, token: string, owner: string): Promise<bigint> {
	return ethCall(chain, token, encode(SIG.balanceOf, owner));
}

/** Approve the LI.FI router to pull USDC. to = USDC. */
export function encodeApproveUsdc(chain: ChainId, spender: string): { to: string; data: string } {
	const usdc = USDC[chain]!;
	return { to: usdc.address, data: encode(SIG.approve, spender, MAX_UINT) };
}
