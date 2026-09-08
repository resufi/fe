import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { TRANCHES, hueStyle } from "../lib/config.ts";
import { fmtAmount, fmtDuration, parseAmount } from "../lib/format.ts";
import { buildClaim, buildDeposit, buildRequestWithdrawal } from "../lib/solanaTx.ts";
import type { useSolanaWallet } from "../hooks/useSolanaWallet.ts";
import type { ProtocolData } from "../hooks/useProtocol.ts";
import css from "./DepositPanel.module.css";
import pos from "./PositionsPanel.module.css";

type Props = {
	data: ProtocolData;
	trancheId: number;
	asset: string;
	wallet: ReturnType<typeof useSolanaWallet>;
	onDone: () => void;
};

const MIN_DEPOSIT = 1_000_000n; // 0.001 при девяти знаках

export function SolanaPanel({ data, trancheId, asset, wallet, onDone }: Props) {
	const [raw, setRaw] = useState("");
	const [busy, setBusy] = useState(false);
	const [note, setNote] = useState<string | null>(null);

	const amount = parseAmount(raw);
	const meta = TRANCHES[trancheId];
	const w = data.wallet;

	const problem = !wallet.address
		? "Connect a wallet"
		: !w
			? "Loading balance…"
			: raw && amount === null
				? "Invalid amount"
				: amount !== null && amount < MIN_DEPOSIT
					? "Amount too small"
					: amount !== null && amount > w.balance
						? "Exceeds your balance"
						: null;

	/** Общий путь для всех действий: собрать, подписать, дождаться. */
	async function submit(build: (owner: PublicKey) => Promise<Uint8Array>, done: string) {
		if (!wallet.address) return;
		setBusy(true);
		setNote(null);
		try {
			const tx = await build(new PublicKey(wallet.address));
			// Как именно подписать — знает сам хук: расширение и WalletConnect
			// подписывают по-разному, но снаружи это одно действие.
			const sig = await wallet.signAndSend(tx);
			setNote(`${done} · ${sig.slice(0, 8)}…`);
			setRaw("");
			// Состояние обновляем не сразу: узлу нужно время увидеть транзакцию.
			setTimeout(onDone, 3000);
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Transaction failed";
			// Отказ в кошельке — обычное действие, а не сбой.
			setNote(/reject|denied|cancel/i.test(msg) ? null : msg);
		} finally {
			setBusy(false);
		}
	}

	return (
		<>
			<section className={css.panel}>
				<header className={css.head}>
					<h2 className={css.title}>Deposit into {meta.name}</h2>
					<button
						type="button"
						className={`${css.linkish} num`}
						onClick={() => w && setRaw(fmtAmount(w.balance, 9).replace(/[\s,]/g, ""))}
						disabled={!w || w.balance === 0n}
					>
						{w ? fmtAmount(w.balance) : "…"}
					</button>
				</header>

				<input
					className={`${css.input} num`}
					inputMode="decimal"
					placeholder="0"
					value={raw}
					onChange={(e) => setRaw(e.target.value)}
					aria-label="Deposit amount"
				/>

				<button
					className={css.btn}
					disabled={busy || !!problem || amount === null}
					onClick={() =>
						void submit(
							(owner) => buildDeposit(owner, trancheId, amount!),
							"Deposited",
						)
					}
				>
					{busy ? "Sending…" : (problem ?? "Deposit")}
				</button>

				{note && <p className={css.note}>{note}</p>}
				<p className="muted small">Shares arrive as an SPL token you can transfer</p>
			</section>

			{w && w.positions.length > 0 && (
				<section className={pos.panel}>
					<h2 className={pos.title}>Your positions</h2>
					<div className={pos.list}>
						{w.positions.map((p) => {
							const now = Math.floor(Date.now() / 1000);
							const matured = p.pendingShares > 0n && now >= p.unlockAt;
							const waiting = p.pendingShares > 0n && !matured;
							return (
								<div key={p.trancheId} className={pos.position} style={hueStyle(p.trancheId)}>
									<div className={pos.main}>
										<span className="muted small">{TRANCHES[p.trancheId].name}</span>
										<div className={pos.figures}>
											<div className={`${pos.value} num`}>
												{fmtAmount(p.valueNow)}
												<span className="muted"> {asset}</span>
											</div>
											<div className="muted small num">
												{fmtAmount(p.shares + p.pendingShares, 4)} shares
											</div>
										</div>
									</div>

									{waiting && (
										<p className={pos.hint}>
											{fmtAmount(p.pendingShares, 4)} exiting · available in{" "}
											{fmtDuration(p.unlockAt - now)}
										</p>
									)}

									<div className={pos.actions}>
										{p.shares > 0n && (
											<button
												className={`${pos.btn} ${pos.ghost}`}
												disabled={busy}
												onClick={() =>
													void submit(
														(owner) =>
															buildRequestWithdrawal(owner, p.trancheId, p.shares),
														"Withdrawal requested",
													)
												}
											>
												Withdraw
											</button>
										)}
										{matured && (
											<button
												className={pos.btn}
												disabled={busy}
												onClick={() =>
													void submit((owner) => buildClaim(owner, p.trancheId), "Claimed")
												}
											>
												Claim
											</button>
										)}
									</div>

									{p.shares > 0n && p.pendingShares === 0n && (
										<p className={pos.hint}>
											Shares are transferable · withdrawal takes{" "}
											{fmtDuration(data.vault.withdrawDelay)}
										</p>
									)}
								</div>
							);
						})}
					</div>
				</section>
			)}
		</>
	);
}
