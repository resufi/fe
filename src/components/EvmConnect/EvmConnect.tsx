import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import type { EvmWallet } from "../../hooks/useEvmWallet.ts";
import { isMobile } from "../../lib/evmWallets.ts";
import { CHAIN_BRAND } from "../../lib/chainBrand.ts";
import type { ChainId } from "../../lib/chains.ts";
import css from "../SolanaConnect/SolanaConnect.module.css";

type Props = { wallet: EvmWallet; chain: ChainId };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function ChainMark({ chain }: { chain: ChainId }) {
	const brand = CHAIN_BRAND[chain];
	if (!brand) return null;

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

function brandStyle(chain: ChainId): CSSProperties | undefined {
	const brand = CHAIN_BRAND[chain];
	if (!brand) return undefined;
	return {
		["--btn-bg" as string]: brand.bg,
		["--btn-fg" as string]: brand.fg,
	};
}

/** Brand colours for wallets that announce no icon (the suggestions + WalletConnect).
 * Installed wallets ship their own icon via EIP-6963, so they skip this. */
const WALLET_BRAND: Record<string, { bg: string; fg: string }> = {
	walletconnect: { bg: "#3396ff", fg: "#ffffff" },
	"io.rabby": { bg: "#7084ff", fg: "#ffffff" },
	"io.metamask": { bg: "#f6851b", fg: "#ffffff" },
	"com.okex.wallet": { bg: "#1f1f1f", fg: "#ffffff" },
	"com.bitget.web3": { bg: "#00c2ff", fg: "#042233" },
};

/** Official WalletConnect mark. */
function WalletConnectGlyph() {
	return (
		<svg viewBox="0 0 480 332" width={13} height={13} aria-hidden="true">
			<path
				fill="currentColor"
				d="M126.6 94c62.6-61.3 164.2-61.3 226.8 0l7.5 7.4c3.1 3 3.1 8 0 11l-25.8 25.3c-1.5 1.5-4 1.5-5.6 0l-10.4-10.1c-43.7-42.9-114.5-42.9-158.2 0l-11.1 10.8c-1.6 1.6-4.1 1.6-5.7 0l-25.8-25.2c-3.1-3.1-3.1-8 0-11zm280.2 52.2 23 22.5c3.1 3 3.1 8 0 11l-103.6 101.5c-3.1 3-8.1 3-11.2 0l-73.5-72c-.8-.8-2-.8-2.8 0l-73.5 72c-3.1 3-8.1 3-11.2 0L50.3 180.7c-3.1-3-3.1-8 0-11l23-22.5c3.1-3.1 8.1-3.1 11.2 0l73.5 72c.8.7 2 .7 2.8 0l73.5-72c3.1-3.1 8.1-3.1 11.2 0l73.5 72c.8.7 2 .7 2.8 0l73.5-72c3.2-3.1 8.2-3.1 11.3 0z"
			/>
		</svg>
	);
}

function Mark({ id, icon, name }: { id: string; icon: string; name: string }) {
	if (icon) {
		return <img className={css.icon} src={icon} alt="" width={20} height={20} />;
	}
	const brand = WALLET_BRAND[id];
	if (brand) {
		return (
			<span
				className={css.icon}
				aria-hidden="true"
				style={{ background: brand.bg, color: brand.fg }}
			>
				{id === "walletconnect" ? <WalletConnectGlyph /> : name.slice(0, 1)}
			</span>
		);
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
										onClick={() => {
											// WalletConnect opens its own modal and an
											// uninstalled wallet opens a new tab — in both cases
											// our picker should get out of the way instead of
											// stacking behind theirs. Installed wallets keep the
											// picker open to show the "connecting…" state, and it
											// closes itself once an address arrives.
											if (w.id === "walletconnect" || !w.installed) setOpen(false);
											void wallet.connect(w.id);
										}}
									>
										<Mark id={w.id} icon={w.icon} name={w.name} />
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
