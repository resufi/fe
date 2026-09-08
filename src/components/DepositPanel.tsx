import { useState } from "react";
import { Address } from "@ton/core";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import { addr, TRANCHES } from "../lib/config.ts";
import { fmtAmount, parseAmount } from "../lib/format.ts";
import { depositMessage, DEPOSIT_TOTAL_TON } from "../lib/payloads.ts";
import { ProtocolData } from "../hooks/useProtocol.ts";
import css from "./DepositPanel.module.css";

type Props = {
	data: ProtocolData;
	trancheId: number;
	onDone: () => void;
};

const MIN_DEPOSIT = 1_000_000_000n;

export function DepositPanel({ data, trancheId, onDone }: Props) {
	const [tonConnectUI] = useTonConnectUI();
	const wallet = useTonAddress();
	const [raw, setRaw] = useState("");
	const [busy, setBusy] = useState(false);
	const [note, setNote] = useState<string | null>(null);

	const amount = parseAmount(raw);
	const meta = TRANCHES[trancheId];
	const w = data.wallet;

	const problem = !wallet
		? "Connect a wallet"
		: !w
			? "Loading balance…"
			: raw && amount === null
				? "Invalid amount"
				: amount !== null && amount < MIN_DEPOSIT
					? "Minimum is 1"
					: amount !== null && amount > w.balance
						? "Exceeds your balance"
						: null;

	async function send() {
		// jettonWallet есть только на TON; эта панель и работает только там.
		const jettonWallet = w?.jettonWallet;
		if (!wallet || amount === null || !jettonWallet) return;
		setBusy(true);
		setNote(null);
		try {
			const body = depositMessage(
				addr.vault(),
				Address.parse(wallet),
				trancheId,
				amount,
			);
			await tonConnectUI.sendTransaction({
				validUntil: Math.floor(Date.now() / 1000) + 300,
				messages: [
					{
						address: jettonWallet.toString(),
						amount: DEPOSIT_TOTAL_TON.toString(),
						payload: body.toBoc().toString("base64"),
					},
				],
			});
			setRaw("");
			setNote(
				"Sent. Shares appear once the transaction reaches the contract — usually a few seconds.",
			);
			setTimeout(onDone, 6000);
		} catch (e) {
			setNote(e instanceof Error ? e.message : "Transaction rejected");
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className={css.panel}>
			<header className={css.head}>
				<h2 className={css.title}>Deposit into {meta.name}</h2>
				<button
					type="button"
					className={`${css.balance} num`}
					onClick={() =>
						w && setRaw(fmtAmount(w.balance, 9).replace(/[\s,]/g, ""))
					}
					disabled={!w || w.balance === 0n}
				>
					{w ? fmtAmount(w.balance) : "\u2026"}
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
				className={css.submit}
				onClick={send}
				disabled={busy || !!problem || amount === null}
			>
				{busy ? "Sending\u2026" : "Deposit"}
			</button>

			{problem && <p className={css.problem}>{problem}</p>}
			{note && <p className={css.note}>{note}</p>}
			<p className={css.gas}>
				+{fmtAmount(DEPOSIT_TOTAL_TON)} GRAM for gas, excess is refunded
			</p>
		</section>
	);
}
