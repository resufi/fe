import type { Pool } from "./pools.ts";
import { EVM_CHAINS } from "./evm.ts";

export function explorerAddressUrl(pool: Pool, address: string): string {
	if (pool.chain === "ton") {
		const host = pool.network === "testnet" ? "testnet.tonviewer.com" : "tonviewer.com";
		return `https://${host}/${address}`;
	}
	if (pool.chain === "solana") {
		const cluster = pool.network === "mainnet" ? "" : `?cluster=${pool.network}`;
		return `https://explorer.solana.com/address/${address}${cluster}`;
	}

	const evm = EVM_CHAINS[pool.chain];
	return evm ? `${evm.explorer}/address/${address}` : "#";
}
