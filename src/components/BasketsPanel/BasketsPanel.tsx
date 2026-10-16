import { useEffect, useState } from "react";
import type { ChainId } from "../../lib/chains.ts";
import type { EvmWallet } from "../../hooks/useEvmWallet.ts";
import { fmtAmount, parseAmount } from "../../lib/format.ts";
import {
	basketsOfChain,
	readBasket,
	readBasketWallet,
	encodeApprove,
	encodeDeposit,
	encodeRedeem,
	type Basket,
	type BasketState,
	type BasketWalletState,
} from "../../lib/baskets.ts";
import css from "../DepositPanel/DepositPanel.module.css";

/**
 * One-click risk profiles over a single vault. Hidden entirely when no basket
 * is deployed on the chain, so it never touches the live app until addresses
 * are filled into baskets.ts.
 *
 * Deposit is one asset in; exit is redemption in kind (a pro-rata slice of the
 * tranche tokens), which is instant and needs no vault window.
 */
export function BasketsPanel({ chain, wallet }: { chain: ChainId; wallet: EvmWallet }) {
	const baskets = basketsOfChain(chain);
	const [sel, setSel] = useState(0);
	const [raw, setRaw] = useState("");
	const [state, setState] = useState<BasketState | null>(null);
	const [w, setW] = useState<BasketWalletState | null>(null);
	const [busy, setBusy] = useState(false);
	const [note, setNote] = useState<string | null>(null);

	const b: Basket | undefined = baskets[sel];
	const decimals = b ? BigInt(b.assetDecimals) : 18n;
	const amount = parseAmount(raw, decimals);

	async function refresh() {
		if (!b) return;
		try {
			setState(await readBasket(b));
			if (wallet.address && !wallet.wrongChain) setW(await readBasketWallet(b, wallet.address));
			else setW(null);
		} catch {
			/* a transient RPC failure just leaves the last values */
		}
	}

	useEffect(() => {
		void refresh();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [b?.address, wallet.address, wallet.wrongChain]);

	if (baskets.length === 0 || !b) return null;

	const needsApproval = amount !== null && w !== null && w.allowance < amount;
	const problem = !wallet.address
		? "Connect a wallet"
		: wallet.wrongChain
			? "Wrong network"
			: !w
				? "Loading…"
				: raw && amount === null
					? "Invalid amount"
					: amount !== null && amount > w.assetBalance
						? "Exceeds your balance"
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
		if (amount === null || !b) return;
		if (needsApproval) {
			const { to, data } = encodeApprove(b);
			void run(to, data, "Approved.");
		} else {
			const { to, data } = encodeDeposit(b, amount);
			void run(to, data, "Deposited.");
		}
	}

	function onRedeem() {
		if (!b || !w || w.shares === 0n) return;
		const { to, data } = encodeRedeem(b, w.shares);
		void run(to, data, "Redeemed.");
	}

	// Position value in wad USD = shares (1e18) x sharePrice (wad) / 1e18.
	const positionUsd = w && state ? (w.shares * state.sharePrice) / 10n ** 18n : 0n;

	return (
		<section className={css.panel}>
			<header className={css.head}>
				<h2 className={css.title}>One-click profiles</h2>
				<button
					type="button"
					className={`${css.balance} num`}
					onClick={() =>
						w && setRaw(fmtAmount(w.assetBalance, b.assetDecimals, decimals).replace(/[\s,]/g, ""))
					}
					disabled={!w || w.assetBalance === 0n}
				>
					{w ? `${fmtAmount(w.assetBalance, 2, decimals)} ${b.assetSymbol}` : "…"}
				</button>
			</header>

			<div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
				{baskets.map((p, i) => (
					<button
						key={p.address}
						type="button"
						className={css.balance}
						onClick={() => {
							setSel(i);
							setNote(null);
						}}
						style={{
							padding: "6px 12px",
							fontWeight: i === sel ? 700 : 500,
							opacity: i === sel ? 1 : 0.6,
						}}
					>
						{p.label} ({p.blendPct[0]}/{p.blendPct[1]}/{p.blendPct[2]})
					</button>
				))}
			</div>

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
				onClick={onPrimary}
				disabled={busy || !!problem || amount === null}
			>
				{busy ? "Sending…" : needsApproval ? `Approve ${b.assetSymbol}` : `Deposit into ${b.label}`}
			</button>

			{w && w.shares > 0n && (
				<div style={{ marginTop: 12 }}>
					<p className="small muted">
						Your position: <b className="num">{fmtAmount(w.shares, 2, 18n)}</b> shares ≈{" "}
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
				Deposit one asset; the basket splits it across Senior/Middle/Junior. Exit returns the
				tranche tokens pro-rata.
			</p>
		</section>
	);
}
