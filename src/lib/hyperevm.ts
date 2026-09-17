import type { Mandate } from "./config.ts";
import { env } from "./env.ts";

/**
 * Чтение пула на HyperEVM.
 *
 * Вызовы собираются вручную, без viem и ethers. Причина та же, что у
 * solana.ts: нам нужно прочитать десяток функций фиксированной формы, а
 * библиотека принесла бы сотни килобайт ради кодирования, которое здесь
 * умещается в две страницы.
 *
 * Раскладка задана в resu-sc-hyperevm/src/ResuVault.sol — при её изменении
 * править здесь.
 */

export const HYPEREVM = {
	chainId: 999,
	chainIdHex: "0x3e7",
	name: "HyperEVM",
	rpc: "https://rpc.hyperliquid.xyz/evm",
	explorer: "https://hyperevm-explorer.vercel.app",
	/** Родная монета сети: ею платится газ. */
	nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
} as const;

export const CONTRACTS = {
	vault: "0x53F7e94a0edd3CFb958332842ec1fEce566f941d",
	/** USDC на HyperEVM. Шесть знаков, как и на Core. */
	asset: "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
	hlp: "0xdfc24b077bc1425AD1DEA75bCB6f8158E10Df303",
	/**
	 * Токены долей, junior -> senior. Порядок сверен с самим пулом через
	 * trancheTokens(i): подписи в сводке развёртывания перепутаны, и верить
	 * им нельзя.
	 */
	trancheTokens: [
		"0x57b6114b9Ad77ad6F1c2a90413ce735eAa1537Bd", // jrHLP
		"0x65107E1896474946baC14f2849D830725E0288CD", // mlHLP
		"0x9E366c12208995667a2C248CbBA4cABDf28B50Fb", // srHLP
	],
} as const;

/** Селекторы. Получены cast sig, менять только вместе с контрактом. */
export const SIG = {
	nav: "0xc1590cd7",
	values: "0x971217b7",
	sharePrice: "0x61a9da23",
	coreBalance: "0x7499aff4",
	inTransit: "0xcaf173bc",
	hlpLockedUntil: "0x6a22fa4e",
	totalShares: "0x13f2dad0",
	claims: "0xa888c2cd",
	tickets: "0xdae7a13c",
	deposit: "0xf4d4c9d7",
	requestWithdrawal: "0xa9ac4ddb",
	claim: "0x95d4063f",
	balanceOf: "0x70a08231",
	allowance: "0xdd62ed3e",
	approve: "0x095ea7b3",
} as const;

const endpoint = () => env("VITE_HYPEREVM_RPC") ?? HYPEREVM.rpc;

let nextId = 1;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
	const res = await fetch(endpoint(), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
	});
	if (!res.ok) throw new Error(`HyperEVM RPC ${res.status}`);
	const json = (await res.json()) as { result?: T; error?: { message: string } };
	if (json.error) throw new Error(json.error.message);
	return json.result as T;
}

/** Слово ABI: 32 байта, выравнивание вправо. */
export const word = (v: bigint | number | string): string => {
	if (typeof v === "string") return v.toLowerCase().replace(/^0x/, "").padStart(64, "0");
	return BigInt(v).toString(16).padStart(64, "0");
};

export const encode = (selector: string, ...args: (bigint | number | string)[]): string =>
	selector + args.map(word).join("");

/** Разбор ответа на слова по 32 байта. */
const words = (hex: string): bigint[] => {
	const body = hex.replace(/^0x/, "");
	const out: bigint[] = [];
	for (let i = 0; i + 64 <= body.length; i += 64) {
		out.push(BigInt("0x" + body.slice(i, i + 64)));
	}
	return out;
};

async function call(to: string, data: string): Promise<bigint[]> {
	return words(await rpc<string>("eth_call", [{ to, data }, "latest"]));
}

export type EvmVaultState = {
	/** Стоимость пула целиком: HLP плюс Core плюс буфер плюс в пути. */
	nav: bigint;
	/** Как она делится по траншам, junior -> senior. */
	values: [bigint, bigint, bigint];
	totalShares: [bigint, bigint, bigint];
	/** Требования senior и mezzanine. У junior его нет — он остаток. */
	claims: [bigint, bigint, bigint];
	coreBalance: bigint;
	inTransit: bigint;
	hlpLockedUntil: number;
};

export async function readVault(): Promise<EvmVaultState> {
	const V = CONTRACTS.vault;
	// Последовательно, а не залпом: публичный узел ограничивает частоту, и
	// пачка параллельных запросов возвращается отказами вместо данных.
	const [nav] = await call(V, SIG.nav);
	const vals = await call(V, SIG.values);
	const shares: bigint[] = [];
	const claims: bigint[] = [];
	for (const i of [0, 1, 2]) {
		shares.push((await call(V, encode(SIG.totalShares, i)))[0]);
		claims.push((await call(V, encode(SIG.claims, i)))[0]);
	}
	const [core] = await call(V, SIG.coreBalance);
	const [transit] = await call(V, SIG.inTransit);
	const [locked] = await call(V, SIG.hlpLockedUntil);

	return {
		nav,
		values: [vals[0], vals[1], vals[2]] as [bigint, bigint, bigint],
		totalShares: shares as [bigint, bigint, bigint],
		claims: claims as [bigint, bigint, bigint],
		coreBalance: core,
		inTransit: transit,
		hlpLockedUntil: Number(locked),
	};
}

export type EvmWalletState = {
	/** Баланс USDC у владельца. */
	balance: bigint;
	/** Сколько владелец разрешил пулу списать. */
	allowance: bigint;
	shares: [bigint, bigint, bigint];
	tickets: { shares: bigint; unlockAt: number }[];
};

export async function readWallet(owner: string): Promise<EvmWalletState> {
	const [balance] = await call(CONTRACTS.asset, encode(SIG.balanceOf, owner));
	const [allowance] = await call(
		CONTRACTS.asset,
		encode(SIG.allowance, owner, CONTRACTS.vault),
	);

	// Доли на руках лежат в токене транша, а не в пуле: с появлением ERC20
	// пул перестал вести собственный список владельцев. Заявки на выход
	// остались у пула — там они и живут.
	const shares: bigint[] = [];
	const tickets: { shares: bigint; unlockAt: number }[] = [];
	for (const i of [0, 1, 2]) {
		shares.push(
			(await call(CONTRACTS.trancheTokens[i], encode(SIG.balanceOf, owner)))[0],
		);
		const t = await call(CONTRACTS.vault, encode(SIG.tickets, owner, i));
		tickets.push({ shares: t[0], unlockAt: Number(t[1]) });
	}

	return {
		balance,
		allowance,
		shares: shares as [bigint, bigint, bigint],
		tickets,
	};
}

/**
 * Мандат пула. Задан при развёртывании и не меняется — читать его незачем.
 *
 * Потолка убытка здесь нет: доли выводятся из NAV заново на каждое чтение,
 * а не списываются событиями, поэтому ограничивать нечего. Плата за защиту
 * тоже отсутствует — вместо неё купоны, которые senior и mezzanine
 * получают, а не платят.
 */
export const MANDATE: Mandate = {
	maxLossBps: 0,
	withdrawDelay: 86400,
	seniorFeeBps: 0,
	seniorFeeToMezzBps: 0,
	mezzFeeBps: 0,
	seniorRateBps: 600,
	mezzRateBps: 1200,
	minDeposit: "1000000",
};
