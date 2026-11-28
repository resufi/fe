import { CHAINS, type ChainId } from "../../lib/chains.ts";
import { findCategory, type CategoryId } from "../../lib/categories.ts";
import type { Pool } from "../../lib/pools.ts";
import css from "./PoolControls.module.css";

type Props = {
	category: CategoryId;
	/** Every chain that has a pool in this category. */
	chains: ChainId[];
	chain: ChainId;
	onChainChange: (id: ChainId) => void;
	pools: Pool[];
	pool: Pool;
	onPoolChange: (p: Pool) => void;
	onBack: () => void;
};

/**
 * Inside a category: pick the asset first, the chain second.
 *
 * The chain row only lists networks that actually have this asset class, so the
 * chain never becomes a dead end.
 */
export function PoolControls({
	category,
	chains,
	chain,
	onChainChange,
	pools,
	pool,
	onPoolChange,
	onBack,
}: Props) {
	const cat = findCategory(category);

	return (
		<div className={css.rows}>
			<div className={css.top}>
				<button type="button" className={css.back} onClick={onBack}>
					← All asset types
				</button>
				{cat && <span className={css.crumb}>{cat.label}</span>}
			</div>

			<div className={css.row} role="radiogroup" aria-label="Pool" data-tour="pools">
				{pools.map((p) => (
					<button
						key={p.id}
						type="button"
						role="radio"
						aria-checked={pool.id === p.id}
						className={`${css.block} ${pool.id === p.id ? css.on : ""}`}
						onClick={() => onPoolChange(p)}
					>
						<span>{p.label}</span>
						{p.partner && <span className={css.partner}>by {p.partner}</span>}
						{!p.deployed && <span className={css.soon}>soon</span>}
					</button>
				))}
			</div>

			{chains.length > 1 && (
				<div
					className={css.row}
					role="radiogroup"
					aria-label="Network"
					data-tour="chains"
				>
					<span className={css.rowLabel}>Network</span>
					{chains.map((id) => (
						<button
							key={id}
							type="button"
							role="radio"
							aria-checked={chain === id}
							className={`${css.chain} ${chain === id ? css.chainOn : ""}`}
							onClick={() => onChainChange(id)}
						>
							{CHAINS[id].name}
							{!CHAINS[id].deployed && <span className={css.soon}>soon</span>}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
