import { useState } from "react";
import { TRANCHES } from "../../lib/config.ts";
import { fmtAmount, parseAmount } from "../../lib/format.ts";
import { CONTRACTS, SIG, encode } from "../../lib/hyperevm.ts";
import type { EvmWallet } from "../../hooks/useEvmWallet.ts";
import type { ProtocolData } from "../../hooks/useProtocol.ts";
import type { Pool } from "../../lib/pools.ts";
import css from "../DepositPanel/DepositPanel.module.css";

type Props = {
	data: ProtocolData;
	trancheId: number;
	pool: Pool;
	wallet: EvmWallet;
	onDone: () => void;
};

const MAX_UINT = (1n << 256n) - 1n;

export function EvmPanel({ data, trancheId, pool, wallet, onDone }: Props) {
	const [raw, setRaw] = useState("");
	const [busy, setBusy] = useState(false);
	const [note, setNote] = useState<string | null>(null);

	const decimals = BigInt(pool.decimals);
	const amount = parseAmount(raw, decimals);
	const meta = TRANCHES[trancheId];
	const w = data.wallet;

	// Разрешение на списание — отдельная транзакция, так устроен ERC20.
	// Пока его не хватает, показываем именно её, а не «внести»: иначе
	// человек подтвердит перевод и увидит отказ.
	const needsApproval =
		amount !== null && w?.allowance !== undefined && w.allowance < amount;

	const problem = !wallet.address
		? "Connect a wallet"
		: wallet.wrongChain
			? "Wrong network"
			: !w
				? "Loading balance…"
				: raw && amount === null
					? "Invalid amount"
					: amount !== null && amount < pool.minDeposit
						? `Minimum is ${fmtAmount(pool.minDeposit, 6, decimals)}`
						: amount !== null && amount > w.balance
							? "Exceeds your balance"
							: null;

	async function run(to: string, data_: string, done: string) {
		setBusy(true);
		setNote(null);
		try {
			const hash = await wallet.send(to, data_);
			setNote(`${done} ${hash.slice(0, 10)}…`);
			setTimeout(onDone, 4000);
		} catch (e) {
			setNote(e instanceof Error ? e.message : "Transaction rejected");
		} finally {
			setBusy(false);
		}
	}

	async function approve() {
		// Бесконечное разрешение, чтобы не платить за него при каждом взносе.
		// Отозвать можно тем же вызовом с нулём.
		await run(
			CONTRACTS.asset,
			encode(SIG.approve, CONTRACTS.vault, MAX_UINT),
			"Approved.",
		);
	}

	async function deposit() {
		if (amount === null) return;
		await run(
			CONTRACTS.vault,
			encode(SIG.deposit, trancheId, amount),
			"Sent.",
		);
	}

	return (
		<section className={css.panel}>
			<header className={css.head}>
				<h2 className={css.title}>Deposit into {meta.name}</h2>
				<button
					type="button"
					className={`${css.balance} num`}
					onClick={() =>
						w && setRaw(fmtAmount(w.balance, pool.decimals, decimals).replace(/[\s,]/g, ""))
					}
					disabled={!w || w.balance === 0n}
				>
					{w ? fmtAmount(w.balance, 2, decimals) : "…"}
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
				onClick={() => void (needsApproval ? approve() : deposit())}
				disabled={busy || !!problem || amount === null}
			>
				{busy
					? "Sending…"
					: needsApproval
						? `Approve ${pool.asset}`
						: "Deposit"}
			</button>

			{problem && <p className={css.problem}>{problem}</p>}
			{note && <p className={css.note}>{note}</p>}
			<p className={css.gas}>Gas is paid in HYPE</p>
		</section>
	);
}
