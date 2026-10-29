import type { ReactNode } from "react";

import { TrancheState } from "../../lib/chain.ts";
import { Mandate, TRANCHES } from "../../lib/config.ts";
import type { PoolKind } from "../../lib/pools.ts";
import { fmtAmount, fmtBps, toGram } from "../../lib/format.ts";
import s from "./Waterfall.module.css";

type Props = {
	tranches: TrancheState[];
	headroom: bigint;
	mandate: Mandate;
	rate: number | null;

	asset: string;
	/** Base asset decimals: nine for tsTON, six for tsUSDe. */
	decimals: number;
	/** Pool economics: a protection fee or fixed coupons. */
	kind: PoolKind;
	/** Chain and pool selector. Lives in the waterfall header — a step of the same choice. */
	controls?: ReactNode;
	selected: number;
	onSelect: (id: number) => void;
};

/**
 * What a tranche earns or gives up per year, on top of the asset's base yield.
 *
 * For "coupon" pools the sign is opposite: there senior doesn't pay for
 * protection but earns a fixed rate, and junior takes not a premium
 * but the entire residual above those rates. Junior has no fixed rate — its
 * number is the leverage on the price move (pool / junior, i.e. 1 / junior's
 * share), shown from the live split so it tracks the real proportions as the
 * pool fills.
 */
function rateLabel(
	id: number,
	m: Mandate,
	kind: PoolKind,
	juniorAssets: bigint,
	total: bigint,
): string {
	if (kind === "coupon") {
		if (id === 2) return `+${fmtBps(m.seniorRateBps ?? 0)}`;
		if (id === 1) return `+${fmtBps(m.mezzRateBps ?? 0)}`;
		// Junior's reward is leverage on the price = pool / junior share. Use the
		// live split once the pool has filled; before that, the design leverage
		// from the target weights, so junior always sees a concrete figure.
		if (juniorAssets > 0n) return `${(Number(total) / Number(juniorAssets)).toFixed(1)}×`;
		if (m.weights && m.weights[0] > 0) return `${(100 / m.weights[0]).toFixed(1)}×`;
		return "highest yield";
	}
	if (id === 2) return `−${fmtBps(m.seniorFeeBps)}`;
	if (id === 1) {
		const net = (m.seniorFeeBps * m.seniorFeeToMezzBps) / 10000 - m.mezzFeeBps;
		return `${net >= 0 ? "+" : "−"}${fmtBps(Math.abs(net))}`;
	}
	return "highest yield";
}

/** A plain 1–5 risk reading: Protected low, Aggressive high. */
function riskLevel(id: number): number {
	return id === 2 ? 1 : id === 1 ? 3 : 5;
}

/** A human caption for what the rate figure means. */
function rateCaption(id: number, kind: PoolKind): string {
	if (kind === "coupon") return id === 0 ? "price leverage" : "fixed · per year";
	if (id === 2) return "protection fee · yr";
	if (id === 1) return "net · per year";
	return "variable yield";
}

export function Waterfall({
	tranches,
	headroom,
	mandate,
	rate,
	asset,
	decimals,
	kind,
	controls,
	selected,
	onSelect,
}: Props) {
	const total = tranches.reduce((sum, t) => sum + t.totalAssets, 0n);
	const empty = total === 0n;

	const order = [2, 1, 0];
	const share = (v: bigint) => Number((v * 10000n) / total) / 100;
	const headroomPct = empty
		? 0
		: Math.min(100, Number((headroom * 10000n) / total) / 100);

	return (
		<section className={s.wf} data-waterfall>
			<header className={s.head}>
				{controls}
				<div className={s.headline}>
					<h2 className={s.title}>
						Risk tiers
						<span className="muted"> — protected on top, a loss hits the bottom first</span>
					</h2>
					{!empty && (
						<span className="muted small">
							{fmtAmount(total, 2, BigInt(decimals))} {asset} pooled
						</span>
					)}
				</div>
			</header>

			<div className={s.stack}>
				{order.map((id) => {
					const meta = TRANCHES[id];
					const state = tranches[id];
					const pct = empty ? 0 : share(state.totalAssets);

					return (
						<button
							key={id}
							type="button"
							className={`${s.band} ${selected === id ? s.on : ""}`}
							onClick={() => onSelect(id)}
							aria-pressed={selected === id}
						>
							<span>
								<span className={s.name}>
									{meta.name} <span className="muted small">· {meta.tech}</span>
								</span>
								<span className={s.order}>{meta.order}</span>
								<span className={s.risk} aria-label={`risk ${riskLevel(id)} of 5`}>
									<span className={s.riskTrack}>
										<span
											className={s.riskFill}
											style={{ width: `${riskLevel(id) * 20}%`, background: `var(${meta.hue})` }}
										/>
									</span>
								</span>
							</span>

							<span className={s.figures}>
								<span className={`${s.rate} num`}>
									{rateLabel(id, mandate, kind, tranches[0].totalAssets, total)}
								</span>
								<span className={s.caption}>{rateCaption(id, kind)}</span>
								<span className={`${s.pool} num`}>
									{rate === null
										? `${fmtAmount(state.totalAssets, 2, BigInt(decimals))} ${asset}`
										: `${fmtAmount(toGram(state.totalAssets, rate))} GRAM`}
									{!empty && ` · ${pct.toFixed(1)}%`}
								</span>
							</span>
						</button>
					);
				})}
			</div>

			{empty ? (
				<p className="muted small">
					No deposits yet — be the first. Your deposit sets the starting mix.
				</p>
			) : kind === "coupon" ? (
				/* This pool has no loss ceiling: shares are re-derived from the pool's
				   value on every read, not written off by events,
				   so there's nothing to cap. Drawing a scale here would
				   promise a limit that doesn't exist. */
				<p className={s.capNote}>
					Your tier's value tracks the pool live. Aggressive absorbs a drop
					first, then Balanced, and Protected only if both are used up.
				</p>
			) : (

				<div className={s.cap}>
					<div className={s.bar}>
						<div className={s.fill} style={{ width: `${headroomPct}%` }} />
					</div>
					<p className={s.capNote}>
						Loss buffer:{" "}
						<span className="num">{fmtAmount(headroom, 2, BigInt(decimals))}</span>. A loss larger
						than this is rejected outright.
					</p>
				</div>
			)}
		</section>
	);
}
