import type { CSSProperties } from "react";
import { Address } from "@ton/core";
import testnet from "../deployments/testnet.json" with { type: "json" };
import mainnet from "../deployments/mainnet.json" with { type: "json" };
import { env } from "./env.ts";
import type { Pool } from "./pools.ts";

export type Mandate = {
	maxLossBps: number;
	withdrawDelay: number;
	seniorFeeBps: number;
	seniorFeeToMezzBps: number;
	mezzFeeBps: number;
	/**
	 * Senior and mezzanine coupons, annualized, for "coupon" pools.
	 *
	 * This is income, not a fee: on HyperEVM senior earns a fixed
	 * rate rather than paying for protection. Separate fields on purpose — adding them
	 * to seniorFeeBps would show income as an expense.
	 */
	seniorRateBps?: number;
	mezzRateBps?: number;
	/**
	 * Minimum deposit in the asset's smallest units, as a string.
	 *
	 * A string, because JSON has no bigint. Not present everywhere: artifacts
	 * from past deploys lack this field, and the fallback below
	 * is for them.
	 */
	minDeposit?: string;
};

export type Deployment = {
	network: "testnet" | "mainnet";
	vault: string | null;
	registry: string | null;
	jettonMaster: string | null;
	vaultJettonWallet: string | null;
	/** Tranche jetton masters — one per tranche, in junior->senior order. */
	trancheMasters?: string[];
	/** Base asset decimals: nine for tsTON, six for tsUSDe. */
	assetDecimals?: number;
	mandate: Mandate;
};

const NETWORK = (env("VITE_NETWORK") ?? "testnet") as
	| "testnet"
	| "mainnet";

export const deployment = (NETWORK === "mainnet"
	? mainnet
	: testnet) as unknown as Deployment;

export const isDeployed = Boolean(deployment.vault && deployment.jettonMaster);

/**
 * The selected pool's addresses.
 *
 * A function of the pool, not a module constant: there is now more than
 * one pool on TON, and a global address set would silently serve the wrong one.
 */
export function addrOf(pool: Pool) {
	return {
		vault: () => Address.parse(pool.vault!),
		registry: () => Address.parse(pool.registry!),
		jettonMaster: () => Address.parse(pool.jettonMaster!),
		/** Source of the base asset's rate to GRAM. A stablecoin has none. */
		assetPool: () => (pool.ratePool ? Address.parse(pool.ratePool) : null),
		/** The tranche jetton master: the user's shares live there too. */
		trancheMaster: (trancheId: number) => {
			const m = pool.trancheMasters[trancheId];
			return m ? Address.parse(m) : null;
		},
	};
}



/**
 * The single source of truth about tranches, including their color: it used to be
 * spread across CSS classes `.t0/.t1/.t2` and `.position--0/1/2`, and adding
 * a tranche needed edits in three places. Here `hue` is a token name from
 * `styles/tokens.css`; the component feeds it into its own `--hue`.
 */
export const TRANCHES = [
	{
		id: 0,
		key: "junior",
		name: "Junior",
		order: "Absorbs losses first",
		hue: "--junior",
	},
	{
		id: 1,
		key: "mezzanine",
		name: "Middle",
		order: "Absorbs losses second",
		hue: "--mezz",
	},
	{
		id: 2,
		key: "senior",
		name: "Senior",
		order: "Absorbs losses last",
		hue: "--senior",
	},
] as const;

/** An inline style giving a component its tranche color. */
export function hueStyle(trancheId: number): CSSProperties {
	return { ["--hue" as string]: `var(${TRANCHES[trancheId].hue})` };
}

export type TrancheMeta = (typeof TRANCHES)[number];

export { DECIMALS } from "./units.ts";
