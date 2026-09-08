import { useEffect, useState } from "react";
import type { useSolanaWallet } from "../hooks/useSolanaWallet.ts";
import { isMobile } from "../lib/wallets.ts";
import { WalletMark } from "./WalletMark.tsx";
import css from "./SolanaConnect.module.css";

type Props = { wallet: ReturnType<typeof useSolanaWallet> };

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export function SolanaConnect({ wallet }: Props) {
	const [open, setOpen] = useState(false);

	// Модалка закрывается сама, как только подключение состоялось.
	useEffect(() => {
		if (wallet.address) setOpen(false);
	}, [wallet.address]);

	// Escape — привычный способ закрыть, и его ждут.
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open]);

	if (wallet.address) {
		return (
			<button
				type="button"
				className={css.button}
				onClick={() => void wallet.disconnect()}
				title={`${wallet.address} · click to disconnect`}
			>
				{short(wallet.address)}
			</button>
		);
	}

	return (
		<>
			<button type="button" className={css.button} onClick={() => setOpen(true)}>
				Connect Wallet
			</button>

			{open && (
				<div
					className={css.backdrop}
					onClick={(e) => e.target === e.currentTarget && setOpen(false)}
				>
					<div className={css.modal} role="dialog" aria-modal="true" aria-label="Connect wallet">
						<header className={css.head}>
							<h2 className={css.title}>Connect a Solana wallet</h2>
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
								// Состояние подписано у каждого варианта: иначе
								// непонятно, что произойдёт по нажатию.
								const state = busy
									? "connecting…"
									: w.id === "walletconnect"
										? isMobile() ? "open app" : "scan QR"
										: w.installed
											? "ready"
											: isMobile() ? "open app" : "install";
								return (
									<button
										key={w.id}
										type="button"
										className={css.item}
										disabled={wallet.connecting !== null}
										onClick={() => void wallet.connect(w.id)}
									>
										<WalletMark id={w.id} />
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
