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

	seniorRateBps?: number;
	mezzRateBps?: number;

	weights?: [number, number, number];

	minDeposit?: string;
};

export type Deployment = {
	network: "testnet" | "mainnet";
	vault: string | null;
	registry: string | null;
	jettonMaster: string | null;
	vaultJettonWallet: string | null;

	trancheMasters?: string[];

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

export function addrOf(pool: Pool) {
	return {
		vault: () => Address.parse(pool.vault!),
		registry: () => Address.parse(pool.registry!),
		jettonMaster: () => Address.parse(pool.jettonMaster!),

		assetPool: () => (pool.ratePool ? Address.parse(pool.ratePool) : null),

		trancheMaster: (trancheId: number) => {
			const m = pool.trancheMasters[trancheId];
			return m ? Address.parse(m) : null;
		},
	};
}

export const TRANCHES = [
	{
		id: 0,
		key: "junior",

		name: "Aggressive",
		tech: "Junior",
		order: "Highest yield · takes the first loss",
		hue: "--junior",
	},
	{
		id: 1,
		key: "mezzanine",
		name: "Balanced",
		tech: "Middle",
		order: "A middle ground",
		hue: "--mezz",
	},
	{
		id: 2,
		key: "senior",
		name: "Protected",
		tech: "Senior",
		order: "Steady yield · loses last",
		hue: "--senior",
	},
] as const;

export function hueStyle(trancheId: number): CSSProperties {
	return { ["--hue" as string]: `var(${TRANCHES[trancheId].hue})` };
}

export type TrancheMeta = (typeof TRANCHES)[number];

export { DECIMALS } from "./units.ts";
