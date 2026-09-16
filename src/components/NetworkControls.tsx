import { TonConnectButton } from "@tonconnect/ui-react";
import type { useSolanaWallet } from "../hooks/useSolanaWallet.ts";
import type { ChainId } from "../lib/chains.ts";
import type { Pool } from "../lib/pools.ts";
import { ChainSwitch } from "./ChainSwitch.tsx";
import { PoolSwitch } from "./PoolSwitch.tsx";
import { SolanaConnect } from "./SolanaConnect.tsx";
import css from "./NetworkControls.module.css";

type Props = {
	chain: ChainId;
	onChange: (id: ChainId) => void;
	/** Пулы выбранной сети. Переключатель прячется, если он один. */
	pools: Pool[];
	pool: Pool;
	onPoolChange: (p: Pool) => void;
	solana: ReturnType<typeof useSolanaWallet>;
};

export function NetworkControls({
	chain,
	onChange,
	pools,
	pool,
	onPoolChange,
	solana,
}: Props) {
	return (
		<span className={css.controls}>
			<ChainSwitch value={chain} onChange={onChange} />
			<PoolSwitch pools={pools} value={pool} onChange={onPoolChange} />

			<span className={css.wallet}>
				{chain === "ton" ? (
					<TonConnectButton />
				) : (
					<SolanaConnect wallet={solana} />
				)}
			</span>
		</span>
	);
}
