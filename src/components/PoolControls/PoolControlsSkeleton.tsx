import css from "./PoolControls.module.css";

/**
 * Скелет переключателей сети и пула.
 *
 * Числа блоков взяты по факту: три сети и два пула у самой длинной из них.
 * Считать их от `CHAIN_LIST` и `POOLS` не нужно и даже вредно — скелет
 * должен быть одинаковым до того, как выбор станет известен.
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
