import css from "./PoolControls.module.css";

/**
 * Skeleton of the chain and pool switchers.
 *
 * The block counts are fixed on purpose: a few chains and two pools for the longest of them.
 * Computing them from `CHAIN_LIST` and `POOLS` is unnecessary and even harmful — the skeleton
 * must be the same before the choice is known.
 */
export function PoolControlsSkeleton() {
	return (
		<div
			className={`${css.rows} ${css.skeleton}`}
			aria-busy="true"
			aria-label="Loading pools"
		>
			<div className={css.row}>
				<span className={css.chainGhost} />
				<span className={css.chainGhost} />
				<span className={css.chainGhost} />
			</div>
			<div className={css.row}>
				<span className={css.ghost} />
				<span className={css.ghost} />
			</div>
		</div>
	);
}
