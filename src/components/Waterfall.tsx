import { TrancheState } from "../lib/chain.ts";
import { hueStyle, Mandate, TRANCHES } from "../lib/config.ts";
import { fmtAmount, fmtBps, toGram } from "../lib/format.ts";
import s from "./Waterfall.module.css";

type Props = {
	tranches: TrancheState[];
	headroom: bigint;
	mandate: Mandate;
	rate: number | null;
	/** Тикер базового актива: у каждой сети свой. */
	asset: string;
	selected: number;
	onSelect: (id: number) => void;
};

function feeLabel(id: number, m: Mandate): string {
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
				<h2 className={s.title}>
					Loss waterfall
					<span className="muted"> — losses fill from the bottom</span>
				</h2>
				{!empty && (
					<span className="muted small">
						{fmtAmount(total)} {asset} pooled
					</span>
				)}
			</header>

			<div className={`${s.stack} ${empty ? s.empty : ""}`}>
				{order.map((id) => {
					const meta = TRANCHES[id];
					const state = tranches[id];
					const pct = empty ? 0 : share(state.totalAssets);

					return (
						<button
							key={id}
							type="button"
							className={`${s.band} ${selected === id ? s.on : ""}`}
							style={{ ...hueStyle(id), flexGrow: pct }}
							onClick={() => onSelect(id)}
							disabled={empty}
							aria-pressed={selected === id}
						>
							<span>
								<span className={s.name}>
									<i className={s.dot} aria-hidden="true" />
									{meta.name}
								</span>
								<span className={s.order}>{meta.order}</span>
							</span>

							<span className={s.figures}>
								<span className={`${s.rate} num`}>{feeLabel(id, mandate)}</span>
								<span className={`${s.pool} num`}>
									{rate === null
										? `${fmtAmount(state.totalAssets)} ${asset}`
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
			) : (
				<div className={s.cap}>
					<div className={s.bar}>
						<div className={s.fill} style={{ width: `${headroomPct}%` }} />
					</div>
					<p className={s.capNote}>
						Maximum writedown:{" "}
						<span className="num">{fmtAmount(headroom)}</span>. Above that the
						contract rejects the loss outright.
					</p>
				</div>
			)}
		</section>
	);
}
