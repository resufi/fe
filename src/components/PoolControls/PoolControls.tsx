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
