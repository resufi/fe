import { useEffect, useState } from "react";
import type { EvmWallet } from "../../hooks/useEvmWallet.ts";
import { isMobile } from "../../lib/evmWallets.ts";
import css from "../SolanaConnect/SolanaConnect.module.css";

type Props = { wallet: EvmWallet };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * The wallet icon.
 *
 * Under EIP-6963 the wallet sends its own icon, and we don't need to draw it for it
 * — unlike Solana, where three icons are drawn in our code.
 * An empty string means WalletConnect or a wallet with no icon: there we put
 * the first letter of the name so the row doesn't fall apart.
 */
function Mark({ icon, name }: { icon: string; name: string }) {
	if (icon) {
		return <img className={css.icon} src={icon} alt="" width={20} height={20} />;
	}
	return (
		<span className={css.icon} aria-hidden="true">
			{name.slice(0, 1)}
		</span>
	);
}

export function EvmConnect({ wallet }: Props) {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		if (wallet.address) setOpen(false);
	}, [wallet.address]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open]);

	if (wallet.address) {
		// The wrong network is one click, not an error. We show it instead of
		// the address: otherwise a person taps "deposit" and hits a rejection.
		if (wallet.wrongChain) {
			return (
				<button
					type="button"
					className={css.button}
					onClick={() => void wallet.switchChain()}
				>
					Switch to {wallet.chainName}
				</button>
			);
		}
		return (
			<button
				type="button"
				className={css.button}
				onClick={() => void wallet.disconnect()}
				title={`${wallet.address} · click to disconnect`}
			>
				<span className={css.mark} aria-hidden="true" />
				{short(wallet.address)}
			</button>
		);
	}

	return (
		<>
			<button type="button" className={css.button} onClick={() => setOpen(true)}>
				<span className={css.mark} aria-hidden="true" />
				Connect Wallet
			</button>

			{open && (
				<div
					className={css.backdrop}
					onClick={(e) => e.target === e.currentTarget && setOpen(false)}
				>
					<div
						className={css.modal}
						role="dialog"
						aria-modal="true"
						aria-label="Connect wallet"
					>
						<header className={css.head}>
							<h2 className={css.title}>Connect a wallet</h2>
							<button
								type="button"
								className={css.close}
								onClick={() => setOpen(false)}
								aria-label="Close"
							>
								✕
							</button>
						</header>

						<div className={css.list}>
							{wallet.entries.map((w) => {
								const busy = wallet.connecting === w.id;
								const state = busy
									? "connecting…"
									: w.id === "walletconnect"
										? isMobile()
											? "open app"
											: "scan QR"
										: w.installed
											? "ready"
											: "install";
								return (
									<button
										key={w.id}
										type="button"
										className={css.item}
										disabled={wallet.connecting !== null}
										onClick={() => void wallet.connect(w.id)}
									>
										<Mark icon={w.icon} name={w.name} />
										<span className={css.name}>{w.name}</span>
										<span className={css.state}>
											{wallet.remembered === w.id && !busy && (
												<span className={css.last}>last used</span>
											)}
											{state}
										</span>
									</button>
								);
							})}
						</div>

						{wallet.error && <p className={css.error}>{wallet.error}</p>}
					</div>
				</div>
			)}
		</>
	);
}
