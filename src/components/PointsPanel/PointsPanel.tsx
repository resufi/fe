import { useEffect, useState } from "react";
import { shortAddress } from "../../lib/format.ts";
import { fetchPoints, entryOf, fmtPoints, type PointsResult } from "../../lib/points.ts";
import css from "../DepositPanel/DepositPanel.module.css";

/**
 * Activity points: USD value held × time, weighted by tier. Read from the
 * static leaderboard the off-chain indexer publishes. Shows the connected
 * wallet's standing and the top holders. Hidden until a leaderboard exists.
 */
export function PointsPanel({ address }: { address: string | null }) {
	const [data, setData] = useState<PointsResult | null>(null);
	const [open, setOpen] = useState(false);

	useEffect(() => {
		void fetchPoints().then(setData);
	}, []);

	// Nothing published yet, or no holders — keep the app uncluttered.
	if (!data || data.leaderboard.length === 0) return null;

	const me = entryOf(data, address);
	const top = data.leaderboard.slice(0, open ? 25 : 5);

	return (
		<section className={css.panel}>
			<header className={css.head}>
				<h2 className={css.title}>Activity points</h2>
				<span className={`${css.balance} num`}>{data.holders} holders</span>
			</header>

			<p className="small muted" style={{ marginBottom: 10 }}>
				Earn points for value held over time — Junior ×3, Middle ×2, Senior ×1. Points go toward
				the future $RESU allocation.
			</p>

			{me ? (
				<div
					className={css.balance}
					style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", marginBottom: 12 }}
				>
					<span>
						You · <b>#{me.rank}</b>
					</span>
					<b className="num">{fmtPoints(me.points)} pts</b>
				</div>
			) : (
				<p className="small muted" style={{ marginBottom: 12 }}>
					{address
						? "No points yet — deposit into a pool or basket to start earning."
						: "Connect a wallet to see your points."}
				</p>
			)}

			<ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
				{top.map((e) => {
					const mine = me && e.address.toLowerCase() === me.address.toLowerCase();
					return (
						<li
							key={e.address}
							style={{
								display: "flex",
								justifyContent: "space-between",
								padding: "6px 2px",
								fontWeight: mine ? 700 : 400,
								opacity: mine ? 1 : 0.85,
							}}
						>
							<span className="small">
								#{e.rank} <code>{shortAddress(e.address)}</code>
							</span>
							<span className="num small">{fmtPoints(e.points)}</span>
						</li>
					);
				})}
			</ol>

			{data.leaderboard.length > 5 && (
				<button
					type="button"
					className={css.balance}
					onClick={() => setOpen((v) => !v)}
					style={{ marginTop: 8, padding: "4px 10px" }}
				>
					{open ? "Show less" : `Show top 25`}
				</button>
			)}

			{data.generatedAt && (
				<p className={css.gas}>Updated {new Date(data.generatedAt).toLocaleString()}.</p>
			)}
		</section>
	);
}
