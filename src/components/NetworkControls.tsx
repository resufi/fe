import { TonConnectButton } from "@tonconnect/ui-react";
import type { useSolanaWallet } from "../hooks/useSolanaWallet.ts";
import type { EvmWallet } from "../hooks/useEvmWallet.ts";
import type { ChainId } from "../lib/chains.ts";
import type { Pool } from "../lib/pools.ts";
import { ChainSwitch } from "./ChainSwitch.tsx";
import { PoolSwitch } from "./PoolSwitch.tsx";
import { SolanaConnect } from "./SolanaConnect.tsx";
import { EvmConnect } from "./EvmConnect.tsx";
import css from "./NetworkControls.module.css";

type Props = {
	chain: ChainId;
	onChange: (id: ChainId) => void;
	/** Пулы выбранной сети. Переключатель прячется, если он один. */
	pools: Pool[];
	pool: Pool;
	onPoolChange: (p: Pool) => void;
	solana: ReturnType<typeof useSolanaWallet>;
	evm: EvmWallet;
};

export function NetworkControls({
	chain,
	onChange,
	pools,
	pool,
	onPoolChange,
	solana,
	evm,
}: Props) {
	return (
		<span className={css.controls}>
			<ChainSwitch value={chain} onChange={onChange} />
			<PoolSwitch pools={pools} value={pool} onChange={onPoolChange} />

			<span className={css.wallet}>
				{chain === "ton" ? (
					<TonConnectButton />
				) : chain === "hyperevm" ? (
					<EvmConnect wallet={evm} />
				) : (
					<SolanaConnect wallet={solana} />
				)}
			</span>
		</span>
	);
}
