import { CHAIN_LIST, type ChainId } from "../../lib/chains.ts";
import type { Pool } from "../../lib/pools.ts";
import css from "./PoolControls.module.css";

type Props = {
	chain: ChainId;
	onChainChange: (id: ChainId) => void;
	pools: Pool[];
	pool: Pool;
	onPoolChange: (p: Pool) => void;
};

/**
 * Chain and pool as blocks, one under the other.
 *
 * The old tabs with a slider didn't survive growth: the slider was computed from the
 * element count and required them all to fit in one equal-width row.
 * The blocks aren't tied to each other — the row simply wraps.
 *
 * Chain and pool differ by shape, not only position: a chain is a label with an
 * underline, a pool is a pill. Both rows used to be pills and got confused
 * with each other.
 *
 * The pool is shown even when a chain has only one. A lone tab selected
 * nothing and was hidden, but a block is also a label: it says what
 * money goes into, and on Hyperliquid and Solana nothing would otherwise remain
 * on screen but the chain name.
 */
export function PoolControls({
	chain,
	onChainChange,
	pools,
	pool,
	onPoolChange,
}: Props) {
	return (
		<div className={css.rows}>
			<div className={css.row} role="radiogroup" aria-label="Network">
				{CHAIN_LIST.map((c) => (
					<button
						key={c.id}
						type="button"
						role="radio"
						aria-checked={chain === c.id}
						className={`${css.chain} ${chain === c.id ? css.chainOn : ""}`}
						onClick={() => onChainChange(c.id)}
					>
						{c.name}
						{/* We mark what's unavailable before the click, not after. */}
						{!c.deployed && <span className={css.soon}>soon</span>}
					</button>
				))}
			</div>

			<div className={css.row} role="radiogroup" aria-label="Pool">
				{pools.map((p) => (
					<button
						key={p.id}
						type="button"
						role="radio"
						aria-checked={pool.id === p.id}
						className={`${css.block} ${pool.id === p.id ? css.on : ""}`}
						onClick={() => onPoolChange(p)}
					>
						{p.label}
						{!p.deployed && <span className={css.soon}>soon</span>}
					</button>
				))}
			</div>
		</div>
	);
}
