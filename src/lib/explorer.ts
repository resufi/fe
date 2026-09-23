import type { Pool } from "./pools.ts";
import { EVM_CHAINS } from "./evm.ts";

/**
 * Ссылка на обозреватель блоков для адреса — у каждой сети свой формат.
 *
 * TON и Solana не EVM, поэтому и путь другой: TON смотрят на tonviewer,
 * Solana — на explorer.solana.com с указанием кластера для девнета.
 */
export function explorerAddressUrl(pool: Pool, address: string): string {
	if (pool.chain === "ton") {
		const host = pool.network === "testnet" ? "testnet.tonviewer.com" : "tonviewer.com";
		return `https://${host}/${address}`;
	}
	if (pool.chain === "solana") {
		const cluster = pool.network === "mainnet" ? "" : `?cluster=${pool.network}`;
		return `https://explorer.solana.com/address/${address}${cluster}`;
	}
	// EVM-сети: HyperEVM, Robinhood — у всех путь /address/<addr>.
	const evm = EVM_CHAINS[pool.chain];
	return evm ? `${evm.explorer}/address/${address}` : "#";
}
