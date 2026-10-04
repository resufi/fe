import type { Mandate } from "./config.ts";
import type { ChainId } from "./chains.ts";
import tonTestnet from "../deployments/testnet.json" with { type: "json" };
import tonMainnet from "../deployments/mainnet.json" with { type: "json" };
import tonStable from "../deployments/mainnet-stable.json" with { type: "json" };
import solanaDevnet from "../deployments/solana-devnet.json" with { type: "json" };
import solanaMainnet from "../deployments/solana-mainnet.json" with { type: "json" };
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

/**
 * Pool registry.
 *
 * A pool is a set of rules over one asset: addresses, decimals, mandate.
 * The interface used to know exactly one pool per chain, with decimals
 * hardcoded as nine in one place for the whole app. With the tsUSDe pool
 * (six decimals) that broke: the same functions render TON and
 * Solana amounts, and one global constant can't be right for all at once.
 *
 * So decimals, asset symbol and minimum deposit now belong to the
 * pool and are passed down explicitly. A guessed value wouldn't error —
 * the amounts would just be off by a thousandfold.
 */
/**
 * How a pool's economics work.
 *
 * "fee" — TON and Solana: every tranche earns the asset's base yield, and
 * senior pays extra for protection on top, flowing down the waterfall.
 *
 * "coupon" — HyperEVM: senior and mezzanine have fixed coupons, junior
 * takes the entire NAV residual. There is no loss ceiling: shares are
 * re-derived from NAV on every read, not written off by events.
 *
 * The difference is not cosmetic, and showing one as the other is wrong: in "fee"
 * senior loses 2%/yr, in "coupon" it earns 6%. The sign is opposite.
 */
export type PoolKind = "fee" | "coupon";

export type Pool = {
	id: string;
	chain: ChainId;
	kind: PoolKind;
	/** Short tab name: the base asset's symbol. */
	label: string;
	/** The base yield-bearing asset. */
	asset: string;
	/** The coin the value is shown in. */
	unit: string;
	/** Decimals of the base asset. */
	decimals: number;
	network: string;
	deployed: boolean;
	mandate: Mandate;
	/** Minimum deposit in the asset's smallest units. */
	minDeposit: bigint;

	/**
	 * The pool used to compute the base asset's rate to GRAM.
	 *
	 * Only tsTON has one: a stablecoin has no GRAM rate and shouldn't —
	 * converting dollars to GRAM would mean inventing a number.
	 */
	ratePool?: string;

	/** Addresses. The shape differs per chain, so they're optional. */
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

/**
 * Minimum deposit from the artifact.
 *
 * As a string, because JSON has no bigint. Artifacts built before the
 * floor became a deploy parameter lack this field — for them
 * one whole token is used.
 */
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
	decimalsFallback = 9,
): Pool {
	const a = raw as Artifact;
	const decimals = a.assetDecimals ?? decimalsFallback;
	return {
		id,
		chain: "ton",
		kind: "fee",
		label,
		asset,
		// Share value is shown in GRAM only where the base asset has a rate
		// to it. A stablecoin has no such rate and needs none.
		unit: "GRAM",
		decimals,
		network: a.network ?? "mainnet",
		deployed: Boolean(a.vault && a.jettonMaster),
		mandate: a.mandate,
		minDeposit: minDepositOf(a, decimals),
		// The Tonstakers pool is the only source of the tsTON->GRAM rate.
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
 * Pools in display order.
 *
 * There is no stablecoin on testnet: Ethena is mainnet-only, and a tab
 * leading nowhere is worse than a missing one.
 */
export const POOLS: Pool[] = [
	TON_NETWORK === "mainnet"
		? tonPool("ton-tston", "tsTON", "tsTON", tonMainnet)
		: tonPool("ton-tston", "tsTON", "tsTON", tonTestnet),
	...(TON_NETWORK === "mainnet"
		? [tonPool("ton-tsusde", "tsUSDe", "tsUSDe", tonStable, 6)]
		: []),
	{
		id: "hyperevm",
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
		// Share tokens are masters, like the jettons on TON and the mints on Solana.
		trancheMasters: [...CONTRACTS.trancheTokens],
	},
	{
		id: "robinhood-spy",
		chain: "robinhood",
		kind: "coupon",
		label: "SPY",
		// Deposit the SPY token; share value is shown in dollars: the price
		// comes from Chainlink, all pool amounts are wad USD (1e18).
		asset: "SPY",
		unit: "USD",
		decimals: 18,
		network: "mainnet",
		deployed: true,
		mandate: ROBINHOOD_MANDATE,
		// Panel floor in SPY units. The contract holds the real $10 minimum
		// (usd = amount x price); this is a soft hint above it.
		minDeposit: 20_000_000_000_000_000n, // 0.02 SPY (~$15)
		vault: ROBINHOOD.vault,
		registry: null,
		jettonMaster: ROBINHOOD.asset,
		trancheMasters: [...ROBINHOOD.trancheTokens],
	},
	{
		id: "arbitrum-weth",
		chain: "arbitrum",
		kind: "coupon",
		label: "WETH",
		// Deposit WETH; share value in dollars via Chainlink ETH/USD.
		asset: "WETH",
		unit: "USD",
		decimals: 18,
		network: "mainnet",
		deployed: true,
		mandate: ARBITRUM_MANDATE,
		minDeposit: 6_000_000_000_000_000n, // 0.006 WETH (~$16)
		vault: ARBITRUM.vault,
		registry: null,
		jettonMaster: ARBITRUM.asset,
		trancheMasters: [...ARBITRUM.trancheTokens],
	},
	{
		id: "base-msft",
		chain: "base",
		kind: "coupon",
		label: "MSFT",
		// Tokenized Microsoft stock (B20), 8 decimals; price from Chainlink.
		asset: "MSFT",
		unit: "USD",
		decimals: 8,
		network: "mainnet",
		deployed: true,
		mandate: MSFT_MANDATE,
		minDeposit: 3_000_000n, // 0.03 MSFT (~$15)
		vault: BASE_MSFT.vault,
		registry: null,
		jettonMaster: BASE_MSFT.asset,
		trancheMasters: [...BASE_MSFT.trancheTokens],
	},
	{
		id: "base-nvda",
		chain: "base",
		kind: "coupon",
		label: "NVDA",
		// Tokenized Nvidia stock (B20), 8 decimals; price from Chainlink.
		asset: "NVDA",
		unit: "USD",
		decimals: 8,
		network: "mainnet",
		deployed: true,
		mandate: NVDA_MANDATE,
		minDeposit: 7_000_000n, // 0.07 NVDA (~$16)
		vault: BASE_NVDA.vault,
		registry: null,
		jettonMaster: BASE_NVDA.asset,
		trancheMasters: [...BASE_NVDA.trancheTokens],
	},
	{
		id: "monad-aprmon",
		chain: "monad",
		kind: "coupon",
		label: "aprMON",
		// Deposit aprMON (staked MON); share value in dollars via the
		// MON/USD x aprMON-rate adapter. Accrued staking yield lands in NAV.
		asset: "aprMON",
		unit: "USD",
		decimals: 18,
		network: "mainnet",
		deployed: true,
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
];

export const poolsOfChain = (chain: ChainId): Pool[] =>
	POOLS.filter((p) => p.chain === chain);

export const findPool = (id: string): Pool | undefined =>
	POOLS.find((p) => p.id === id);

const STORAGE_KEY = "resu:pool";

/** The last selected pool. A small convenience, not protocol state. */
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
