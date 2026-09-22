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
	/** Знаков у базового актива: девять у tsTON, шесть у tsUSDe. */
	decimals: number;
	/** Экономика пула: плата за защиту или фиксированные купоны. */
	kind: PoolKind;
	/** Выбор сети и пула. Живёт в шапке водопада — это шаг того же выбора. */
	controls?: ReactNode;
	selected: number;
	onSelect: (id: number) => void;
};

/**
 * Что транш получает или отдаёт за год, сверх базовой доходности актива.
 *
 * У пулов вида "coupon" знак противоположный: там senior не платит за
 * защиту, а получает фиксированную ставку, и junior забирает не надбавку,
 * а весь остаток сверх этих ставок.
 */
function rateLabel(id: number, m: Mandate, kind: PoolKind): string {
	if (kind === "coupon") {
		if (id === 2) return `+${fmtBps(m.seniorRateBps ?? 0)}`;
		if (id === 1) return `+${fmtBps(m.mezzRateBps ?? 0)}`;
		return "all the rest";
	}
	if (id === 2) return `−${fmtBps(m.seniorFeeBps)}`;
	if (id === 1) {
		const net = (m.seniorFeeBps * m.seniorFeeToMezzBps) / 10000 - m.mezzFeeBps;
		return `${net >= 0 ? "+" : "−"}${fmtBps(Math.abs(net))}`;
	}
	return "remainder";
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
						Loss waterfall
						<span className="muted"> — losses fill from the bottom</span>
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
								<span className={s.name}>{meta.name}</span>
								<span className={s.order}>{meta.order}</span>
							</span>

							<span className={s.figures}>
								<span className={`${s.rate} num`}>{rateLabel(id, mandate, kind)}</span>
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
					Pool is empty. The first deposit sets the proportions.
				</p>
			) : kind === "coupon" ? (
				/* У этого пула потолка убытка нет: доли выводятся из стоимости
				   пула заново на каждое чтение, а не списываются событиями,
				   поэтому ограничивать нечего. Рисовать здесь шкалу значило бы
				   обещать предел, которого не существует. */
				<p className={s.capNote}>
					No write-off ceiling here: the split is recomputed from the pool
					value on every read. Buffer absorbs the drawdown until it is gone,
					then Balance, then Shield.
				</p>
			) : (

				<div className={s.cap}>
					<div className={s.bar}>
						<div className={s.fill} style={{ width: `${headroomPct}%` }} />
					</div>
					<p className={s.capNote}>
						Maximum writedown:{" "}
						<span className="num">{fmtAmount(headroom, 2, BigInt(decimals))}</span>. Above that the
						contract rejects the loss outright.
					</p>
				</div>
			)}
		</section>
	);
}
