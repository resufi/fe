import type { Pool } from "./pools.ts";
import { EVM_CHAINS } from "./evm.ts";

/**
 * A block-explorer link for an address — each chain has its own format.
 *
 * TON and Solana aren't EVM, so the path differs: TON goes to tonviewer,
 * Solana to explorer.solana.com with the cluster for devnet.
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
	// EVM chains: HyperEVM, Robinhood — all use the path /address/<addr>.
	const evm = EVM_CHAINS[pool.chain];
	return evm ? `${evm.explorer}/address/${address}` : "#";
}
