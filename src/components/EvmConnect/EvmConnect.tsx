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
