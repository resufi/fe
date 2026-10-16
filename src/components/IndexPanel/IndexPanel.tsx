import { useEffect, useState } from "react";
import type { ChainId } from "../../lib/chains.ts";
import type { EvmWallet } from "../../hooks/useEvmWallet.ts";
import { fmtAmount, parseAmount } from "../../lib/format.ts";
import {
	indexesOfChain,
	readIndex,
	readIndexWallet,
	encodeApproveLeg,
	encodeDeposit,
	encodeRedeem,
	type IndexBasket,
	type IndexState,
	type IndexWalletState,
} from "../../lib/indexes.ts";
import css from "../DepositPanel/DepositPanel.module.css";

/**
 * Diversified index baskets over several vaults on one chain — one tranche
 * (typically senior) spread across more than a single name. Hidden entirely
 * when no index is deployed on the chain, so it never touches the live app
 * until an address is filled into indexes.ts.
 *
 * Deposit is per leg (each leg holds a different asset); exit is redemption in
 * kind, instant and with no vault window.
 */
export function IndexPanel({ chain, wallet }: { chain: ChainId; wallet: EvmWallet }) {
	const indexes = indexesOfChain(chain);
	const [sel, setSel] = useState(0);
	const [raws, setRaws] = useState<string[]>([]);
	const [state, setState] = useState<IndexState | null>(null);
	const [w, setW] = useState<IndexWalletState | null>(null);
	const [busy, setBusy] = useState(false);
	const [note, setNote] = useState<string | null>(null);

	const x: IndexBasket | undefined = indexes[sel];

	// Per-leg parsed amounts (null = empty/invalid).
	const amounts = x ? x.legs.map((leg, i) => parseAmount(raws[i] ?? "", BigInt(leg.assetDecimals))) : [];

	async function refresh() {
		if (!x) return;
		try {
			setState(await readIndex(x));
			if (wallet.address && !wallet.wrongChain) setW(await readIndexWallet(x, wallet.address));
			else setW(null);
		} catch {
			/* a transient RPC failure just leaves the last values */
		}
	}

	useEffect(() => {
		setRaws([]);
		setNote(null);
		void refresh();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [x?.address, wallet.address, wallet.wrongChain]);

	if (indexes.length === 0 || !x) return null;

	// Legs the user actually wants to fund (amount > 0).
	const funded = amounts
		.map((amt, i) => ({ amt, i }))
		.filter((e): e is { amt: bigint; i: number } => e.amt !== null && e.amt > 0n);

	// The first funded leg still short on allowance drives an approve step.
	const toApprove =
		w && funded.find((e) => w.legs[e.i] && w.legs[e.i].allowance < e.amt);

	const anyInvalid = x.legs.some((_, i) => (raws[i] ?? "") !== "" && amounts[i] === null);
	const overBalance =
		w && funded.some((e) => w.legs[e.i] && e.amt > w.legs[e.i].assetBalance);

	const problem = !wallet.address
		? "Connect a wallet"
		: wallet.wrongChain
			? "Wrong network"
			: !w
				? "Loading…"
				: anyInvalid
					? "Invalid amount"
					: overBalance
						? "Exceeds your balance"
						: funded.length === 0
							? "Enter an amount for at least one leg"
							: null;

	async function run(to: string, data: string, done: string) {
		setBusy(true);
		setNote(null);
		try {
			const hash = await wallet.send(to, data);
			setNote(`${done} ${hash.slice(0, 10)}…`);
			setTimeout(() => void refresh(), 4000);
		} catch (e) {
			setNote(e instanceof Error ? e.message : "Transaction rejected");
		} finally {
			setBusy(false);
		}
	}

	function onPrimary() {
		if (!x || problem) return;
		if (toApprove) {
			const { to, data } = encodeApproveLeg(x, toApprove.i);
			void run(to, data, `Approved ${x.legs[toApprove.i].assetSymbol}.`);
			return;
		}
		// Full-length amounts vector; unfunded legs are zero (skipped on-chain).
		const vector = x.legs.map((_, i) => (amounts[i] && amounts[i]! > 0n ? amounts[i]! : 0n));
		const { to, data } = encodeDeposit(x, vector);
		void run(to, data, "Deposited.");
	}

	function onRedeem() {
		if (!x || !w || w.shares === 0n) return;
		const { to, data } = encodeRedeem(x, w.shares);
		void run(to, data, "Redeemed.");
	}

	function setLeg(i: number, v: string) {
		setRaws((prev) => {
			const next = [...prev];
			next[i] = v;
			return next;
		});
	}

	const positionUsd = w && state ? (w.shares * state.sharePrice) / 10n ** 18n : 0n;
	const primaryLabel = busy
		? "Sending…"
		: toApprove
			? `Approve ${x.legs[toApprove.i].assetSymbol}`
			: `Deposit into ${x.symbol}`;

	return (
		<section className={css.panel}>
			<header className={css.head}>
				<h2 className={css.title}>Index baskets</h2>
				{state && (
					<span className={`${css.balance} num`}>
						${fmtAmount(state.totalValueUsd, 2, 18n)} TVL
					</span>
				)}
			</header>

			{indexes.length > 1 && (
				<div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
					{indexes.map((ix, i) => (
						<button
							key={ix.address}
							type="button"
							className={css.balance}
							onClick={() => setSel(i)}
							style={{
								padding: "6px 12px",
								fontWeight: i === sel ? 700 : 500,
								opacity: i === sel ? 1 : 0.6,
							}}
						>
							{ix.symbol}
						</button>
					))}
				</div>
			)}

			<p className="small muted" style={{ marginBottom: 10 }}>
				{x.label} — {x.legs[0].tranche} spread across {x.legs.map((l) => l.assetSymbol).join(" + ")}.
			</p>

			{x.legs.map((leg, i) => (
				<div key={leg.asset} style={{ marginBottom: 10 }}>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "baseline",
							marginBottom: 4,
						}}
					>
						<span className="small">
							{leg.assetSymbol} <span className="muted">· {leg.tranche}</span>
						</span>
						<button
							type="button"
							className={`${css.balance} num`}
							onClick={() =>
								w &&
								setLeg(
									i,
									fmtAmount(w.legs[i].assetBalance, leg.assetDecimals, BigInt(leg.assetDecimals)).replace(
										/[\s,]/g,
										"",
									),
								)
							}
							disabled={!w || !w.legs[i] || w.legs[i].assetBalance === 0n}
						>
							{w && w.legs[i] ? `${fmtAmount(w.legs[i].assetBalance, 2, BigInt(leg.assetDecimals))}` : "…"}
						</button>
					</div>
					<input
						className={`${css.input} num`}
						inputMode="decimal"
						placeholder="0"
						value={raws[i] ?? ""}
						onChange={(e) => setLeg(i, e.target.value)}
						aria-label={`${leg.assetSymbol} deposit amount`}
					/>
				</div>
			))}

			<button className={css.submit} onClick={onPrimary} disabled={busy || !!problem}>
				{primaryLabel}
			</button>

			{w && w.shares > 0n && (
				<div style={{ marginTop: 12 }}>
					<p className="small muted">
						Your position: <b className="num">{fmtAmount(w.shares, 2, 18n)}</b> {x.symbol} ≈{" "}
						<b className="num">${fmtAmount(positionUsd, 2, 18n)}</b>
					</p>
					<button
						className={css.submit}
						onClick={onRedeem}
						disabled={busy}
						style={{ marginTop: 6 }}
					>
						{busy ? "Sending…" : "Redeem all (in kind)"}
					</button>
				</div>
			)}

			{problem && <p className={css.problem}>{problem}</p>}
			{note && <p className={css.note}>{note}</p>}
			<p className={css.gas}>
				Bring an amount of each leg (zero to skip one); the index routes each into its vault&apos;s
				{" "}
				{x.legs[0].tranche} tranche. Exit returns the tranche tokens pro-rata.
			</p>
		</section>
	);
}
