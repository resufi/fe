import type { CSSProperties } from "react";
import { Address } from "@ton/core";
import testnet from "../deployments/testnet.json";
import mainnet from "../deployments/mainnet.json";

export type Mandate = {
	maxLossBps: number;
	withdrawDelay: number;
	seniorFeeBps: number;
	seniorFeeToMezzBps: number;
	mezzFeeBps: number;
};

export type Deployment = {
	network: "testnet" | "mainnet";
	vault: string | null;
	registry: string | null;
	jettonMaster: string | null;
	vaultJettonWallet: string | null;
	mandate: Mandate;
};

const NETWORK = (import.meta.env.VITE_NETWORK ?? "testnet") as
	| "testnet"
	| "mainnet";

export const deployment = (NETWORK === "mainnet"
	? mainnet
	: testnet) as unknown as Deployment;

export const isDeployed = Boolean(deployment.vault && deployment.jettonMaster);

export const addr = {
	vault: () => Address.parse(deployment.vault!),
	registry: () => Address.parse(deployment.registry!),
	jettonMaster: () => Address.parse(deployment.jettonMaster!),
	assetPool: () => (ASSET_POOL ? Address.parse(ASSET_POOL) : null),
};

const ASSET_POOL = "EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR";

/**
 * Единственный источник правды о траншах, включая их цвет: раньше он был
 * размазан по CSS-классам `.t0/.t1/.t2` и `.position--0/1/2`, и добавление
 * транша требовало правок в трёх местах. Здесь `hue` — имя токена из
 * `styles/tokens.css`, компонент подставляет его в свою `--hue`.
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

/** Инлайновый стиль, задающий компоненту цвет его транша. */
export function hueStyle(trancheId: number): CSSProperties {
	return { ["--hue" as string]: `var(${TRANCHES[trancheId].hue})` };
}

export type TrancheMeta = (typeof TRANCHES)[number];

export { DECIMALS } from "./units.ts";
