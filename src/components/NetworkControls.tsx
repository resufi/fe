import { TonConnectButton } from "@tonconnect/ui-react";
import type { useSolanaWallet } from "../hooks/useSolanaWallet.ts";
import type { ChainId } from "../lib/chains.ts";
import { ChainSwitch } from "./ChainSwitch.tsx";
import { SolanaConnect } from "./SolanaConnect.tsx";
import css from "./NetworkControls.module.css";

type Props = {
	chain: ChainId;
	onChange: (id: ChainId) => void;
	solana: ReturnType<typeof useSolanaWallet>;
};

export function NetworkControls({ chain, onChange, solana }: Props) {
	return (
		<span className={css.controls}>
			<ChainSwitch value={chain} onChange={onChange} />

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
