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
	type Profile,
	type BasketState,
	type BasketWalletState,
} from "../../lib/baskets.ts";
import {
	zapSupported,
	quoteUsdcToAsset,
	readUsdcBalance,
	readUsdcAllowance,
	encodeApproveUsdc,
	type ZapQuote,
} from "../../lib/zap.ts";
import css from "../DepositPanel/DepositPanel.module.css";
import bs from "./BasketsPanel.module.css";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const PROFILE_ORDER: Profile[] = ["conservative", "balanced", "aggressive"];

export function BasketsPanel({
	chain,
	wallet,
}: {
	chain: ChainId;
	wallet: EvmWallet;
}) {
	const baskets = basketsOfChain(chain);
	const canZap = zapSupported(chain);

	const assets = [...new Set(baskets.map((x) => x.assetSymbol))];
	const [assetSel, setAssetSel] = useState(assets[0] ?? "");
	const [profileSel, setProfileSel] = useState<Profile>("balanced");
	const [raw, setRaw] = useState("");
	const [state, setState] = useState<BasketState | null>(null);
	const [w, setW] = useState<BasketWalletState | null>(null);
	const [busy, setBusy] = useState(false);
	const [note, setNote] = useState<string | null>(null);

	const [payUsdc, setPayUsdc] = useState(false);
	const [usdcBal, setUsdcBal] = useState<bigint | null>(null);
	const [quote, setQuote] = useState<ZapQuote | null>(null);
	const [quoting, setQuoting] = useState(false);
	const [usdcAllowance, setUsdcAllowance] = useState<bigint | null>(null);

	const activeAsset = assets.includes(assetSel) ? assetSel : (assets[0] ?? "");
	const forAsset = baskets.filter((x) => x.assetSymbol === activeAsset);
	const orderedProfiles = PROFILE_ORDER.map((pr) =>
		forAsset.find((x) => x.profile === pr),
	).filter((x): x is Basket => Boolean(x));
	const b: Basket | undefined =
		orderedProfiles.find((x) => x.profile === profileSel) ?? orderedProfiles[0];
	const decimals = b ? BigInt(b.assetDecimals) : 18n;
	const amount = parseAmount(raw, payUsdc ? 6n : decimals);

	async function refresh() {
		if (!b) return;
		try {
			setState(await readBasket(b));
			if (wallet.address && !wallet.wrongChain) {
				setW(await readBasketWallet(b, wallet.address));
				if (canZap) setUsdcBal(await readUsdcBalance(chain, wallet.address));
			} else {
				setW(null);
				setUsdcBal(null);
			}
		} catch {}
	}

	useEffect(() => {
		void refresh();
	}, [b?.address, wallet.address, wallet.wrongChain]);

	useEffect(() => {
		if (
			!payUsdc ||
			!b ||
			!wallet.address ||
			wallet.wrongChain ||
			amount === null ||
			amount <= 0n
		) {
			setQuote(null);
			return;
		}
		let live = true;
		setQuoting(true);
		const t = setTimeout(() => {
			quoteUsdcToAsset(chain, b.asset, amount, wallet.address!)
				.then(async (q) => {
					if (!live) return;
					setQuote(q);

					if (q.ok)
						setUsdcAllowance(
							await readUsdcAllowance(
								chain,
								wallet.address!,
								q.approvalAddress,
							),
						);
				})
				.catch(() => live && setQuote(null))
				.finally(() => live && setQuoting(false));
		}, 400);
		return () => {
			live = false;
			clearTimeout(t);
		};
	}, [payUsdc, b?.asset, raw, wallet.address, wallet.wrongChain, chain]);

	if (baskets.length === 0 || !b) return null;

	const needsApproval =
		!payUsdc && amount !== null && w !== null && w.allowance < amount;
	const needsUsdcApproval =
		payUsdc &&
		!!quote &&
		quote.ok &&
		usdcAllowance !== null &&
		amount !== null &&
		usdcAllowance < amount;

	const problem = !wallet.address
		? "Connect a wallet"
		: wallet.wrongChain
			? "Wrong network"
			: !w
				? "Loading…"
				: raw && amount === null
					? "Invalid amount"
					: payUsdc
						? usdcBal !== null && amount !== null && amount > usdcBal
							? "Exceeds your USDC balance"
							: amount !== null && amount > 0n && !quoting && quote && !quote.ok
								? "No swap route for this amount"
								: null
						: amount !== null && amount > w.assetBalance
							? "Exceeds your balance"
							: null;

	async function run(
		to: string,
		data: string,
		done: string,
		after?: () => void,
	) {
		setBusy(true);
		setNote(null);
		try {
			const hash = await wallet.send(to, data);
			setNote(`${done} ${hash.slice(0, 10)}…`);
			setTimeout(() => void refresh(), 4000);
			after?.();
		} catch (e) {
			setNote(e instanceof Error ? e.message : "Transaction rejected");
		} finally {
			setBusy(false);
		}
	}

	function onPrimary() {
		if (amount === null || !b) return;
		if (payUsdc) {
			if (!quote || !quote.ok) return;
			if (needsUsdcApproval) {
				const { to, data } = encodeApproveUsdc(chain, quote.approvalAddress);
				void run(to, data, "USDC approved.", () =>
					setUsdcAllowance((1n << 256n) - 1n),
				);
			} else {
				void run(
					quote.to,
					quote.data,
					`Swapped to ${b.assetSymbol} - now deposit.`,
					() => {
						setPayUsdc(false);
						setRaw("");
						setQuote(null);
					},
				);
			}
			return;
		}
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

	const positionUsd =
		w && state ? (w.shares * state.sharePrice) / 10n ** 18n : 0n;

	const inputDecimals = payUsdc ? 6 : b.assetDecimals;
	const inputBalance = payUsdc ? usdcBal : (w?.assetBalance ?? null);
	const inputSymbol = payUsdc ? "USDC" : b.assetSymbol;

	const primaryLabel = busy
		? "Sending…"
		: payUsdc
			? needsUsdcApproval
				? "Approve USDC"
				: `Swap USDC → ${b.assetSymbol}`
			: needsApproval
				? `Approve ${b.assetSymbol}`
				: `Deposit into ${b.label}`;

	return (
		<section className={css.panel}>
			<header className={css.head}>
				<h2 className={css.title}>One-click profiles</h2>
				<button
					type="button"
					className={`${css.balance} num`}
					onClick={() =>
						inputBalance !== null &&
						setRaw(
							fmtAmount(
								inputBalance,
								inputDecimals,
								BigInt(inputDecimals),
							).replace(/[\s,]/g, ""),
						)
					}
					disabled={inputBalance === null || inputBalance === 0n}
				>
					{inputBalance !== null
						? `${fmtAmount(inputBalance, 2, BigInt(inputDecimals))} ${inputSymbol}`
						: "…"}
				</button>
			</header>

			{assets.length > 1 && (
				<div className={bs.group}>
					<div className={bs.label}>Asset</div>
					<div className={bs.assets} role="radiogroup" aria-label="Asset">
						{assets.map((a) => (
							<button
								key={a}
								type="button"
								role="radio"
								aria-checked={activeAsset === a}
								className={`${bs.asset} ${activeAsset === a ? bs.assetOn : ""}`}
								onClick={() => {
									setAssetSel(a);
									setNote(null);
								}}
							>
								{a}
							</button>
						))}
					</div>
				</div>
			)}

			<div className={bs.group}>
				<div className={bs.label}>Profile</div>
				<div className={bs.profiles} role="radiogroup" aria-label="Profile">
					{orderedProfiles.map((p) => (
						<button
							key={p.address}
							type="button"
							role="radio"
							aria-checked={p.profile === b.profile}
							className={`${bs.profile} ${p.profile === b.profile ? bs.profileOn : ""}`}
							onClick={() => {
								setProfileSel(p.profile);
								setNote(null);
							}}
						>
							<span className={bs.pName}>{cap(p.profile)}</span>
							<span className={bs.pBlend}>
								{p.blendPct[0]}/{p.blendPct[1]}/{p.blendPct[2]}
							</span>
						</button>
					))}
				</div>
			</div>

			<input
				className={`${css.input} num`}
				inputMode="decimal"
				placeholder="0"
				value={raw}
				onChange={(e) => setRaw(e.target.value)}
				aria-label={payUsdc ? "USDC amount" : "Deposit amount"}
			/>

			{canZap && (
				<p className={bs.payline}>
					<span>Paying with {payUsdc ? "USDC" : b.assetSymbol} ·</span>
					<button
						type="button"
						className={bs.payswap}
						onClick={() => {
							setPayUsdc(!payUsdc);
							setRaw("");
							setNote(null);
							setQuote(null);
						}}
					>
						use {payUsdc ? b.assetSymbol : "USDC"} instead
					</button>
				</p>
			)}

			{payUsdc && amount !== null && amount > 0n && (
				<p className="small muted" style={{ marginTop: 2 }}>
					{quoting
						? "Fetching best price…"
						: quote && quote.ok
							? `≈ ${fmtAmount(quote.buyAmount, 4, decimals)} ${b.assetSymbol} (min ${fmtAmount(
									quote.minBuyAmount,
									4,
									decimals,
								)} after slippage)`
							: quote && !quote.ok
								? "No swap route for this amount."
								: ""}
				</p>
			)}

			<button
				className={css.submit}
				onClick={onPrimary}
				disabled={
					busy ||
					!!problem ||
					amount === null ||
					(payUsdc && (!quote || !quote.ok))
				}
			>
				{primaryLabel}
			</button>

			{w && w.shares > 0n && (
				<div style={{ marginTop: 12 }}>
					<p className="small muted">
						Your position: <b className="num">{fmtAmount(w.shares, 2, 18n)}</b>{" "}
						shares ≈ <b className="num">${fmtAmount(positionUsd, 2, 18n)}</b>
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
				{payUsdc
					? "USDC is swapped to the underlying via 0x, then deposited. Slippage applies; you deposit what the swap actually returns."
					: "Deposit one asset; the basket splits it across all three tiers (Protected / Balanced / Aggressive). Exit returns the tier tokens pro-rata."}
			</p>
		</section>
	);
}
