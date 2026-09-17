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
	 * Купоны senior и mezzanine, годовых, у пулов вида "coupon".
	 *
	 * Это не плата, а доход: на HyperEVM senior получает фиксированную
	 * ставку, а не платит за защиту. Поля отдельные намеренно — сложить их
	 * с seniorFeeBps значило бы показать доход как расход.
	 */
	seniorRateBps?: number;
	mezzRateBps?: number;
	/**
	 * Минимальный взнос в минимальных единицах актива, строкой.
	 *
	 * Строкой, потому что JSON не знает bigint. Появилось не везде: артефакты
	 * прошлых деплоев этого поля не содержат, и запасное значение ниже
	 * рассчитано на них.
	 */
	minDeposit?: string;
};

export type Deployment = {
	network: "testnet" | "mainnet";
	vault: string | null;
	registry: string | null;
	jettonMaster: string | null;
	vaultJettonWallet: string | null;
	/** Мастера жетонов траншей — по одному на транш, в порядке junior→senior. */
	trancheMasters?: string[];
	/** Разрядность базового актива: девять у tsTON, шесть у tsUSDe. */
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
 * Адреса выбранного пула.
 *
 * Функция от пула, а не модульная константа: пулов на TON теперь больше
 * одного, и глобальный набор адресов молча обслуживал бы не тот.
 */
export function addrOf(pool: Pool) {
	return {
		vault: () => Address.parse(pool.vault!),
		registry: () => Address.parse(pool.registry!),
		jettonMaster: () => Address.parse(pool.jettonMaster!),
		/** Источник курса базового актива к GRAM. У стейбла его нет. */
		assetPool: () => (pool.ratePool ? Address.parse(pool.ratePool) : null),
		/** Мастер жетона транша: там же живут доли пользователя. */
		trancheMaster: (trancheId: number) => {
			const m = pool.trancheMasters[trancheId];
			return m ? Address.parse(m) : null;
		},
	};
}



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
