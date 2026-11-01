import css from "./PoolControls.module.css";

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
