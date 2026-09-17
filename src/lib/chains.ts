import solanaMainnet from "../deployments/solana-mainnet.json" with { type: "json" };
import type { Mandate } from "./config.ts";

export type ChainId = "ton" | "solana" | "hyperevm";

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
	solana: {
		id: "solana",
		name: "Solana",

		asset: SOLANA_NETWORK === "mainnet" ? "JitoSOL" : "devSOL",
		unit: "SOL",
		deployed: Boolean(solana.programId),
		mandate: solana.mandate,
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
