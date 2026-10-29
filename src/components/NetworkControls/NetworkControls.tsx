import { TonConnectButton } from "@tonconnect/ui-react";
import type { useSolanaWallet } from "../../hooks/useSolanaWallet.ts";
import type { EvmWallet } from "../../hooks/useEvmWallet.ts";
import type { ChainId } from "../../lib/chains.ts";
import { EVM_CHAINS } from "../../lib/evm.ts";
import { SolanaConnect } from "../SolanaConnect/SolanaConnect.tsx";
import { EvmConnect } from "../EvmConnect/EvmConnect.tsx";
import css from "./NetworkControls.module.css";

type Props = {
	chain: ChainId;
	solana: ReturnType<typeof useSolanaWallet>;
	evm: EvmWallet;
};

export function NetworkControls({
	chain,
	solana,
	evm,
}: Props) {
	return (
		<span className={css.controls}>
			<span className={css.wallet}>
				{chain === "ton" ? (
					<TonConnectButton />
				) : chain in EVM_CHAINS ? (
					<EvmConnect wallet={evm} />
				) : (
					<SolanaConnect wallet={solana} />
				)}
			</span>
		</span>
	);
}
