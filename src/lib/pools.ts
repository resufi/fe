import type { Mandate } from "./config.ts";
import type { ChainId } from "./chains.ts";
import type { CategoryId } from "./categories.ts";
import tonTestnet from "../deployments/testnet.json" with { type: "json" };
import tonMainnet from "../deployments/mainnet.json" with { type: "json" };
import tonStable from "../deployments/mainnet-stable.json" with { type: "json" };
import solanaDevnet from "../deployments/solana-devnet.json" with { type: "json" };
import solanaMainnet from "../deployments/solana-mainnet.json" with { type: "json" };
import solanaP0Mainnet from "../deployments/solana-p0-mainnet.json" with { type: "json" };
import solanaP0Devnet from "../deployments/solana-p0-devnet.json" with { type: "json" };
import { env } from "./env.ts";
import { CONTRACTS, MANDATE as HYPEREVM_MANDATE } from "./hyperevm.ts";
import { CONTRACTS as ROBINHOOD, MANDATE as ROBINHOOD_MANDATE } from "./robinhood.ts";
import { CONTRACTS as ARBITRUM, MANDATE as ARBITRUM_MANDATE } from "./arbitrum.ts";
import {
	MSFT as BASE_MSFT,
	MSFT_MANDATE,
	NVDA as BASE_NVDA,
	NVDA_MANDATE,
} from "./base.ts";
import { CONTRACTS as MONAD, MANDATE as MONAD_MANDATE } from "./monad.ts";

export type PoolKind = "fee" | "coupon";

export type Pool = {
	id: string;
	chain: ChainId;
	kind: PoolKind;
	/** Asset type — what the navigation is organised by. */
	category: CategoryId;
	/** Shown as a badge; P0 pools are partner integrations. */
	partner?: string;

	label: string;

	asset: string;

	unit: string;

	decimals: number;
	network: string;
	deployed: boolean;
	mandate: Mandate;

	minDeposit: bigint;

	ratePool?: string;

	priceFeed?: "chainlink";

	vault: string | null;
	registry: string | null;
	jettonMaster: string | null;
	trancheMasters: string[];
};

type Artifact = {
	network?: string;
	vault?: string | null;
	registry?: string | null;
	jettonMaster?: string | null;
	trancheMasters?: string[];
	assetDecimals?: number;
	mandate: Mandate;
};

function minDepositOf(a: Artifact, decimals: number): bigint {
	return a.mandate.minDeposit
		? BigInt(a.mandate.minDeposit)
		: 10n ** BigInt(decimals);
}

function tonPool(
	id: string,
	label: string,
	asset: string,
	raw: unknown,
	category: CategoryId = "staking",
	decimalsFallback = 9,
): Pool {
	const a = raw as Artifact;
	const decimals = a.assetDecimals ?? decimalsFallback;
	return {
		id,
		chain: "ton",
		kind: "fee",
		category,
		label,
		asset,

		unit: "GRAM",
		decimals,
		network: a.network ?? "mainnet",
		deployed: Boolean(a.vault && a.jettonMaster),
		mandate: a.mandate,
		minDeposit: minDepositOf(a, decimals),

		ratePool:
			asset === "tsTON"
				? "EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR"
				: undefined,
		vault: a.vault ?? null,
		registry: a.registry ?? null,
		jettonMaster: a.jettonMaster ?? null,
		trancheMasters: a.trancheMasters ?? [],
	};
}

const TON_NETWORK = (env("VITE_NETWORK") ?? "testnet") as "testnet" | "mainnet";
const SOLANA_NETWORK = (env("VITE_SOLANA_NETWORK") ?? "devnet") as
	| "devnet"
	| "mainnet";

const solanaRaw = (SOLANA_NETWORK === "mainnet" ? solanaMainnet : solanaDevnet) as unknown as Artifact & {
	programId?: string | null;
	assetMint?: string | null;
	trancheMints?: string[];
};

/**
 * A P0 pool is a second Solana deployment whose base asset is USDC and whose
 * vault lends into a marginfi bank. Its artifact is separate from the JitoSOL
 * one, and stays absent until that vault is deployed.
 */
const p0Raw = (SOLANA_NETWORK === "mainnet" ? solanaP0Mainnet : solanaP0Devnet) as unknown as Artifact & {
	assetMint?: string | null;
	trancheMints?: string[];
};

export const POOLS: Pool[] = [
	TON_NETWORK === "mainnet"
		? tonPool("ton-tston", "tsTON", "tsTON", tonMainnet)
		: tonPool("ton-tston", "tsTON", "tsTON", tonTestnet),
	...(TON_NETWORK === "mainnet"
		? [tonPool("ton-tsusde", "tsUSDe", "tsUSDe", tonStable, "stable", 6)]
		: []),
	{
		id: "hyperevm",
		category: "rwa",
		chain: "hyperevm",
		kind: "coupon",
		label: "HLP",
		asset: "USDC",
		unit: "USD",
		decimals: 6,
		network: "mainnet",
		deployed: true,
		mandate: HYPEREVM_MANDATE,
		minDeposit: 1_000_000n,
		vault: CONTRACTS.vault,
		registry: null,
		jettonMaster: CONTRACTS.asset,

		trancheMasters: [...CONTRACTS.trancheTokens],
	},
	{
		id: "robinhood-spy",
		category: "stocks",
		chain: "robinhood",
		kind: "coupon",
		label: "SPY",

		asset: "SPY",
		unit: "USD",
		decimals: 18,
		network: "mainnet",
		deployed: true,
		priceFeed: "chainlink",
		mandate: ROBINHOOD_MANDATE,

		minDeposit: 20_000_000_000_000_000n, // 0.02 SPY (~$15)
		vault: ROBINHOOD.vault,
		registry: null,
		jettonMaster: ROBINHOOD.asset,
		trancheMasters: [...ROBINHOOD.trancheTokens],
	},
	{
		id: "arbitrum-weth",
		category: "crypto",
		chain: "arbitrum",
		kind: "coupon",
		label: "WETH",

		asset: "WETH",
		unit: "USD",
		decimals: 18,
		network: "mainnet",
		deployed: true,
		priceFeed: "chainlink",
		mandate: ARBITRUM_MANDATE,
		minDeposit: 6_000_000_000_000_000n, // 0.006 WETH (~$16)
		vault: ARBITRUM.vault,
		registry: null,
		jettonMaster: ARBITRUM.asset,
		trancheMasters: [...ARBITRUM.trancheTokens],
	},
	{
		id: "base-msft",
		category: "stocks",
		chain: "base",
		kind: "coupon",
		label: "MSFT",

		asset: "MSFT",
		unit: "USD",
		decimals: 8,
		network: "mainnet",
		deployed: true,
		priceFeed: "chainlink",
		mandate: MSFT_MANDATE,
		minDeposit: 3_000_000n, // 0.03 MSFT (~$15)
		vault: BASE_MSFT.vault,
		registry: null,
		jettonMaster: BASE_MSFT.asset,
		trancheMasters: [...BASE_MSFT.trancheTokens],
	},
	{
		id: "base-nvda",
		category: "stocks",
		chain: "base",
		kind: "coupon",
		label: "NVDA",

		asset: "NVDA",
		unit: "USD",
		decimals: 8,
		network: "mainnet",
		deployed: true,
		priceFeed: "chainlink",
		mandate: NVDA_MANDATE,
		minDeposit: 7_000_000n, // 0.07 NVDA (~$16)
		vault: BASE_NVDA.vault,
		registry: null,
		jettonMaster: BASE_NVDA.asset,
		trancheMasters: [...BASE_NVDA.trancheTokens],
	},
	{
		id: "monad-aprmon",
		category: "staking",
		chain: "monad",
		kind: "coupon",
		label: "aprMON",

		asset: "aprMON",
		unit: "USD",
		decimals: 18,
		network: "mainnet",
		deployed: true,
		priceFeed: "chainlink",
		mandate: MONAD_MANDATE,
		minDeposit: 300_000_000_000_000_000_000n, // ~300 aprMON (~$11)
		vault: MONAD.vault,
		registry: null,
		jettonMaster: MONAD.asset,
		trancheMasters: [...MONAD.trancheTokens],
	},
	{
		id: "solana",
		chain: "solana",
		kind: "fee",
		category: "staking",
		label: SOLANA_NETWORK === "mainnet" ? "JitoSOL" : "devSOL",
		asset: SOLANA_NETWORK === "mainnet" ? "JitoSOL" : "devSOL",
		unit: "SOL",
		decimals: 9,
		network: SOLANA_NETWORK,
		deployed: Boolean(solanaRaw.vault),
		mandate: solanaRaw.mandate,
		minDeposit: 1_000_000n,
		vault: solanaRaw.vault ?? null,
		registry: solanaRaw.registry ?? null,
		jettonMaster: solanaRaw.assetMint ?? null,
		trancheMasters: solanaRaw.trancheMints ?? [],
	},
	{
		id: "solana-p0",
		chain: "solana",
		kind: "fee",
		category: "project0",
		partner: "Project Ø",
		label: "USDC",
		asset: "USDC",
		unit: "USD",
		decimals: 6,
		network: SOLANA_NETWORK,
		deployed: Boolean(p0Raw.vault),
		mandate: p0Raw.mandate,
		minDeposit: minDepositOf(p0Raw, 6),
		vault: p0Raw.vault ?? null,
		registry: p0Raw.registry ?? null,
		jettonMaster: p0Raw.assetMint ?? null,
		trancheMasters: p0Raw.trancheMints ?? [],
	},
];

export const poolsOfChain = (chain: ChainId): Pool[] =>
	POOLS.filter((p) => p.chain === chain);

export const poolsOfCategory = (category: CategoryId): Pool[] =>
	POOLS.filter((p) => p.category === category);

export const findPool = (id: string): Pool | undefined =>
	POOLS.find((p) => p.id === id);

const STORAGE_KEY = "resu:pool";

export function loadPool(): Pool {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			const found = findPool(saved);
			if (found) return found;
		}
	} catch {
		// private mode or blocked storage — no reason to crash
	}
	return POOLS[0];
}

export function savePool(id: string): void {
	try {
		localStorage.setItem(STORAGE_KEY, id);
	} catch {
		// see above
	}
}
