import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import type { EvmWallet } from "../../hooks/useEvmWallet.ts";
import { isMobile } from "../../lib/evmWallets.ts";
import { CHAIN_BRAND } from "../../lib/chainBrand.ts";
import type { ChainId } from "../../lib/chains.ts";
import css from "../SolanaConnect/SolanaConnect.module.css";

type Props = { wallet: EvmWallet; chain: ChainId };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * The chain's own mark, and with it the chain's colours on the button.
 *
 * A generic wallet glyph used to stand here for every EVM chain at once,
 * because one chain's logo would have been wrong for the others. It is right
 * now: the button belongs to the chain currently chosen, and that chain is
 * what a person is about to connect to.
 */
function ChainMark({ chain }: { chain: ChainId }) {
	const brand = CHAIN_BRAND[chain];
	if (!brand) return null;

	// A silhouette is painted in the button's text colour, so it holds together
	// with the label; a full-colour logo is shown as it is.
	if (brand.mono) {
		return (
			<span
				className={css.chainMask}
				aria-hidden="true"
				style={{
					maskImage: `url(${brand.mark})`,
					WebkitMaskImage: `url(${brand.mark})`,
				}}
			/>
		);
	}
	return <img className={css.chainMark} src={brand.mark} alt="" width={16} height={16} />;
}

/** Inline so an unknown chain falls back to the neutral button, not to blank. */
function brandStyle(chain: ChainId): CSSProperties | undefined {
	const brand = CHAIN_BRAND[chain];
	if (!brand) return undefined;
	return {
		["--btn-bg" as string]: brand.bg,
		["--btn-fg" as string]: brand.fg,
	};
}

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

export function EvmConnect({ wallet, chain }: Props) {
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
					style={brandStyle(chain)}
					onClick={() => void wallet.switchChain()}
				>
					<ChainMark chain={chain} />
					Switch to {wallet.chainName}
				</button>
			);
		}
		return (
			<button
				type="button"
				className={css.button}
				style={brandStyle(chain)}
				onClick={() => void wallet.disconnect()}
				title={`${wallet.address} · click to disconnect`}
			>
				<ChainMark chain={chain} />
				{short(wallet.address)}
			</button>
		);
	}

	return (
		<>
			<button
				type="button"
				className={css.button}
				style={brandStyle(chain)}
				onClick={() => setOpen(true)}
			>
				<ChainMark chain={chain} />
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
