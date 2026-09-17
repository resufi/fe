import type { Mandate } from "./config.ts";
import type { ChainId } from "./chains.ts";
import tonTestnet from "../deployments/testnet.json" with { type: "json" };
import tonMainnet from "../deployments/mainnet.json" with { type: "json" };
import tonStable from "../deployments/mainnet-stable.json" with { type: "json" };
import solanaDevnet from "../deployments/solana-devnet.json" with { type: "json" };
import solanaMainnet from "../deployments/solana-mainnet.json" with { type: "json" };
import { env } from "./env.ts";
import { CONTRACTS, MANDATE as HYPEREVM_MANDATE } from "./hyperevm.ts";

/**
 * Реестр пулов.
 *
 * Пул — это набор правил поверх одного актива: адреса, разрядность, мандат.
 * Раньше интерфейс знал ровно один пул на сеть, и разрядность была зашита
 * девяткой в одном месте на всё приложение. С появлением пула на tsUSDe
 * (шесть знаков) это перестало работать: те же функции рисуют суммы TON и
 * Solana, и одна глобальная константа не может быть верной сразу для всех.
 *
 * Поэтому разрядность, символ актива и минимальный взнос теперь принадлежат
 * пулу и передаются вниз явно. Угаданное значение не вызвало бы ошибки —
 * суммы просто оказались бы в тысячу раз не теми.
 */
/**
 * Как устроена экономика пула.
 *
 * "fee" — TON и Solana: все транши получают базовую доходность актива, а
 * senior сверх того платит за защиту, и плата течёт вниз по водопаду.
 *
 * "coupon" — HyperEVM: senior и mezzanine имеют фиксированные купоны, junior
 * получает весь остаток NAV. Потолка убытка нет: доли выводятся из NAV
 * заново на каждое чтение, а не списываются событиями.
 *
 * Разница не косметическая, и показывать одну как другую нельзя: у "fee"
 * senior теряет 2% годовых, у "coupon" — получает 6%. Знак противоположный.
 */
export type PoolKind = "fee" | "coupon";

export type Pool = {
	id: string;
	chain: ChainId;
	kind: PoolKind;
	/** Короткое имя для вкладки: символ базового актива. */
	label: string;
	/** Базовый доходный актив. */
	asset: string;
	/** Монета, в которой показывается стоимость. */
	unit: string;
	/** Знаков после запятой у базового актива. */
	decimals: number;
	network: string;
	deployed: boolean;
	mandate: Mandate;
	/** Минимальный взнос в минимальных единицах актива. */
	minDeposit: bigint;

	/**
	 * Пул, по которому считается курс базового актива к GRAM.
	 *
	 * Есть только у tsTON: у стейбла курса к GRAM нет и быть не должно —
	 * пересчитывать доллары в GRAM значило бы выдумывать число.
	 */
	ratePool?: string;

	/** Адреса. Форма разная у сетей, поэтому необязательные. */
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
 * Минимальный взнос из артефакта.
 *
 * Строкой, потому что JSON не знает bigint. Артефакты, собранные до того как
 * порог стал параметром развёртывания, этого поля не содержат — для них
 * берётся один целый токен.
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
		// Стоимость долей показывается в GRAM только там, где есть курс
		// базового актива к нему. У стейбла такого курса нет и не нужно.
		unit: "GRAM",
		decimals,
		network: a.network ?? "mainnet",
		deployed: Boolean(a.vault && a.jettonMaster),
		mandate: a.mandate,
		minDeposit: minDepositOf(a, decimals),
		// Пул Tonstakers — единственный источник курса tsTON к GRAM.
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
 * Пулы в порядке показа.
 *
 * На тестнете стейбла нет: Ethena живёт только на мейннете, и вкладка,
 * ведущая в пустоту, хуже отсутствующей.
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
		// Токены долей — такие же мастера, как жетоны на TON и минты на Solana.
		trancheMasters: [...CONTRACTS.trancheTokens],
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

/** Последний выбранный пул. Мелкое удобство, не состояние протокола. */
export function loadPool(): Pool {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			const found = findPool(saved);
			if (found) return found;
		}
	} catch {
		// приватный режим или заблокированное хранилище — не повод падать
	}
	return POOLS[0];
}

export function savePool(id: string): void {
	try {
		localStorage.setItem(STORAGE_KEY, id);
	} catch {
		// см. выше
	}
}
