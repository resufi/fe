import { env } from "./env.ts";
import type { ChainId } from "./chains.ts";

/**
 * Общий слой для всех EVM-сетей Resu: HyperEVM, Robinhood, Arbitrum.
 *
 * Вызовы собираются вручную, без viem и ethers — та же причина, что у
 * solana.ts: нам нужно прочитать десяток функций фиксированной формы, а
 * библиотека принесла бы сотни килобайт. Сети отличаются только адресами и
 * узлом; читающая логика одна.
 *
 * Купонный контракт (OracleVault на Robinhood/Arbitrum) и HLP-контракт
 * (ResuVault на HyperEVM) совпадают по сигнатурам чтения — nav/values/
 * totalShares/claims/tickets, — поэтому обслуживаются одним ридером.
 */

export type EvmChainParams = {
	chainId: number;
	chainIdHex: string;
	name: string;
	rpc: string;
	/** Переменная окружения, переопределяющая узел (публичный бывает медленным). */
	rpcEnv?: string;
	explorer: string;
	nativeCurrency: { name: string; symbol: string; decimals: number };
};

/** Параметры EVM-сетей. Ключ совпадает с ChainId приложения. */
export const EVM_CHAINS: Partial<Record<ChainId, EvmChainParams>> = {
	hyperevm: {
		chainId: 999,
		chainIdHex: "0x3e7",
		name: "HyperEVM",
		rpc: "https://rpc.hyperliquid.xyz/evm",
		rpcEnv: "VITE_HYPEREVM_RPC",
		explorer: "https://hyperevm-explorer.vercel.app",
		nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
	},
	robinhood: {
		chainId: 4663,
		chainIdHex: "0x1237",
		name: "Robinhood Chain",
		rpc: "https://rpc.mainnet.chain.robinhood.com",
		rpcEnv: "VITE_ROBINHOOD_RPC",
		explorer: "https://robinhoodchain.blockscout.com",
		nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
	},
};

export function evmChain(id: ChainId): EvmChainParams {
	const c = EVM_CHAINS[id];
	if (!c) throw new Error(`${id} is not an EVM chain`);
	return c;
}

export function evmRpc(id: ChainId): string {
	const c = evmChain(id);
	return (c.rpcEnv ? env(c.rpcEnv) : undefined) ?? c.rpc;
}

/** Селекторы. Общие для ResuVault и OracleVault — сигнатуры совпадают. */
export const SIG = {
	nav: "0xc1590cd7",
	values: "0x971217b7",
	sharePrice: "0x61a9da23",
	pricePerAsset: "0x183d32db",
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

/** Слово ABI: 32 байта, выравнивание вправо. */
export const word = (v: bigint | number | string): string => {
	if (typeof v === "string") return v.toLowerCase().replace(/^0x/, "").padStart(64, "0");
	return BigInt(v).toString(16).padStart(64, "0");
};

export const encode = (selector: string, ...args: (bigint | number | string)[]): string =>
	selector + args.map(word).join("");

const words = (hex: string): bigint[] => {
	const body = hex.replace(/^0x/, "");
	const out: bigint[] = [];
	for (let i = 0; i + 64 <= body.length; i += 64) out.push(BigInt("0x" + body.slice(i, i + 64)));
	return out;
};

let nextId = 1;

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
	const res = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
	});
	if (!res.ok) throw new Error(`EVM RPC ${res.status}`);
	const json = (await res.json()) as { result?: T; error?: { message: string } };
	if (json.error) throw new Error(json.error.message);
	return json.result as T;
}

/** Адреса пула на EVM-сети. */
export type EvmPoolContracts = {
	chain: ChainId;
	vault: string;
	/** Базовый актив, который вносят (USDC на HLP, SPY-токен на Robinhood). */
	asset: string;
	/** Токены долей, junior -> senior. */
	trancheTokens: readonly string[];
};

const call = (c: EvmPoolContracts, to: string, data: string) =>
	rpc<string>(evmRpc(c.chain), "eth_call", [{ to, data }, "latest"]).then(words);

export type EvmVaultState = {
	nav: bigint;
	values: [bigint, bigint, bigint];
	totalShares: [bigint, bigint, bigint];
};

/**
 * Состояние пула. Последовательно, а не залпом: публичный узел лимитирован,
 * и пачка параллельных запросов возвращается отказами вместо данных.
 */
export async function readVault(c: EvmPoolContracts): Promise<EvmVaultState> {
	const [nav] = await call(c, c.vault, SIG.nav);
	const vals = await call(c, c.vault, SIG.values);
	const shares: bigint[] = [];
	for (const i of [0, 1, 2]) shares.push((await call(c, c.vault, encode(SIG.totalShares, i)))[0]);
	return {
		nav,
		values: [vals[0], vals[1], vals[2]],
		totalShares: shares as [bigint, bigint, bigint],
	};
}

export type EvmWalletState = {
	balance: bigint;
	allowance: bigint;
	shares: [bigint, bigint, bigint];
	tickets: { shares: bigint; unlockAt: number }[];
};

export async function readWallet(c: EvmPoolContracts, owner: string): Promise<EvmWalletState> {
	const [balance] = await call(c, c.asset, encode(SIG.balanceOf, owner));
	const [allowance] = await call(c, c.asset, encode(SIG.allowance, owner, c.vault));

	// Доли на руках лежат в токене транша, а не в пуле. Заявки на выход —
	// у пула, там они и живут.
	const shares: bigint[] = [];
	const tickets: { shares: bigint; unlockAt: number }[] = [];
	for (const i of [0, 1, 2]) {
		shares.push((await call(c, c.trancheTokens[i], encode(SIG.balanceOf, owner)))[0]);
		const t = await call(c, c.vault, encode(SIG.tickets, owner, i));
		tickets.push({ shares: t[0], unlockAt: Number(t[1]) });
	}
	return { balance, allowance, shares: shares as [bigint, bigint, bigint], tickets };
}
