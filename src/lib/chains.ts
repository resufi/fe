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
		// Базовый актив — доля в HLP, вейлте маркетмейкера биржи. Доходность
		// там своя, не стейкинговая, и просадки настоящие.
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
		// Базовый актив — токенизированный SPY (S&P 500). Стоимость доли
		// считается в долларах через Chainlink; senior получает купон.
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
		// Базовый актив — WETH; стоимость доли в долларах через Chainlink
		// ETH/USD, senior получает купон.
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
		// Токенизированные акции Coinbase (B20): MSFT и NVDA. Стоимость доли
		// в долларах через Chainlink, senior получает купон.
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
		// aprMON — застейканный MON (LST aPriori). Стоимость доли в долларах
		// через адаптер MON/USD x курс aprMON; senior получает купон.
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
