import solanaMainnet from "../deployments/solana-mainnet.json" with { type: "json" };
import type { Mandate } from "./config.ts";

/**
 * Реестр сетей.
 *
 * Экономика протокола от сети не зависит: три транша, водопад потерь снизу
 * вверх, плата за защиту сверху вниз. Различаются только базовый актив,
 * способ подключения кошелька и то, как читается состояние.
 */
export type ChainId = "ton" | "solana";

export type ChainInfo = {
	id: ChainId;
	name: string;
	/** Базовый доходный актив, поверх которого работает пул. */
	asset: string;
	/** Монета, в которой считается стоимость для пользователя. */
	unit: string;
	/** Развёрнут ли протокол в этой сети. */
	deployed: boolean;
	mandate: Mandate;
};

/**
 * Solana-версия написана и покрыта тестами экономики, но не развёрнута:
 * для сборки программы нужен BPF-тулчейн, а для тестов — локальный валидатор.
 * Интерфейс показывает это честно, а не притворяется работающим.
 */
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
		// Мандат TON приходит из своего артефакта деплоя — см. config.ts.
		mandate: {
			maxLossBps: 0,
			withdrawDelay: 0,
			seniorFeeBps: 0,
			seniorFeeToMezzBps: 0,
			mezzFeeBps: 0,
		},
	},
	solana: {
		id: "solana",
		name: "Solana",
		// На девнете базовый актив тестовый: выдавать его за JitoSOL нельзя.
		asset: SOLANA_NETWORK === "mainnet" ? "JitoSOL" : "devSOL",
		unit: "SOL",
		deployed: Boolean(solana.programId),
		mandate: solana.mandate,
	},
};

export const CHAIN_LIST = Object.values(CHAINS);

const STORAGE_KEY = "resu:chain";

/** Последняя выбранная сеть. Мелкое удобство, не состояние протокола. */
export function loadChain(): ChainId {
	try {
		const v = localStorage.getItem(STORAGE_KEY);
		if (v === "ton" || v === "solana") return v;
	} catch {
		// приватный режим или заблокированное хранилище — не повод падать
	}
	return "ton";
}

export function saveChain(id: ChainId): void {
	try {
		localStorage.setItem(STORAGE_KEY, id);
	} catch {
		// см. выше
	}
}
