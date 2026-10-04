import solanaMainnet from "../deployments/solana-mainnet.json" with { type: "json" };
import type { Mandate } from "./config.ts";

export type ChainId = "ton" | "solana" | "hyperevm" | "robinhood" | "arbitrum" | "base" | "monad";

export type ChainInfo = {
	id: ChainId;
	name: string;

	asset: string;

	unit: string;

	deployed: boolean;
	mandate: Mandate;
};

import solanaDevnet from "../deployments/solana-devnet.json" with { type: "json" };
import { env } from "./env.ts";

const SOLANA_NETWORK = (env("VITE_SOLANA_NETWORK") ?? "devnet") as
	| "devnet"
	| "mainnet";

const solana = (SOLANA_NETWORK === "mainnet"
	? solanaMainnet
	: solanaDevnet) as unknown as {
	programId: string | null;
	mandate: Mandate;
};

export const CHAINS: Record<ChainId, ChainInfo> = {
	ton: {
		id: "ton",
		name: "TON",
		asset: "tsTON",
		unit: "GRAM",
		deployed: true,

		mandate: {
			maxLossBps: 0,
			withdrawDelay: 0,
			seniorFeeBps: 0,
			seniorFeeToMezzBps: 0,
			mezzFeeBps: 0,
		},
	},
	hyperevm: {
		id: "hyperevm",
		name: "Hyperliquid",
		// Base asset: a share of HLP, the exchange's market-maker vault. Its
		// yield is its own, not staking, and the drawdowns are real.
		asset: "USDC",
		unit: "USD",
		deployed: true,
		mandate: {
			maxLossBps: 0,
			withdrawDelay: 86400,
			seniorFeeBps: 0,
			seniorFeeToMezzBps: 0,
			mezzFeeBps: 0,
		},
	},
	robinhood: {
		id: "robinhood",
		name: "Robinhood",
		// Base asset: tokenized SPY (S&P 500). Share value in dollars via
		// Chainlink; senior earns a coupon.
		asset: "SPY",
		unit: "USD",
		deployed: true,
		mandate: {
			maxLossBps: 0,
			withdrawDelay: 86400,
			seniorFeeBps: 0,
			seniorFeeToMezzBps: 0,
			mezzFeeBps: 0,
		},
	},
	solana: {
		id: "solana",
		name: "Solana",

		asset: SOLANA_NETWORK === "mainnet" ? "JitoSOL" : "devSOL",
		unit: "SOL",
		deployed: Boolean(solana.programId),
		mandate: solana.mandate,
	},
	arbitrum: {
		id: "arbitrum",
		name: "Arbitrum",
		// Base asset: WETH; share value in dollars via Chainlink ETH/USD,
		// senior earns a coupon.
		asset: "WETH",
		unit: "USD",
		deployed: true,
		mandate: {
			maxLossBps: 0,
			withdrawDelay: 86400,
			seniorFeeBps: 0,
			seniorFeeToMezzBps: 0,
			mezzFeeBps: 0,
		},
	},
	base: {
		id: "base",
		name: "Base",
		// Coinbase tokenized stocks (B20): MSFT and NVDA. Share value in
		// dollars via Chainlink, senior earns a coupon.
		asset: "Stocks",
		unit: "USD",
		deployed: true,
		mandate: {
			maxLossBps: 0,
			withdrawDelay: 345600,
			seniorFeeBps: 0,
			seniorFeeToMezzBps: 0,
			mezzFeeBps: 0,
		},
	},
	monad: {
		id: "monad",
		name: "Monad",
		// aprMON: staked MON (aPriori LST). Share value in dollars via the
		// MON/USD x aprMON-rate adapter; senior earns a coupon.
		asset: "aprMON",
		unit: "USD",
		deployed: true,
		mandate: {
			maxLossBps: 0,
			withdrawDelay: 86400,
			seniorFeeBps: 0,
			seniorFeeToMezzBps: 0,
			mezzFeeBps: 0,
		},
	},
};

export const CHAIN_LIST = Object.values(CHAINS);

const STORAGE_KEY = "resu:chain";

export function loadChain(): ChainId {
	try {
		const v = localStorage.getItem(STORAGE_KEY);
		if (v === "ton" || v === "solana") return v;
	} catch {
	}
	return "ton";
}

export function saveChain(id: ChainId): void {
	try {
		localStorage.setItem(STORAGE_KEY, id);
	} catch {
	}
}
