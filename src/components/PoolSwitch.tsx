import type { Pool } from "../lib/pools.ts";
import css from "./ChainSwitch.module.css";

type Props = { pools: Pool[]; value: Pool; onChange: (p: Pool) => void };

/**
 * Выбор пула внутри сети.
 *
 * Показывается только когда пулов больше одного: единственная вкладка ничего
 * не выбирает и лишь отнимает место. Оформление общее с переключателем сетей
 * намеренно — это один и тот же жест, просто уровнем ниже.
 */
export function PoolSwitch({ pools, value, onChange }: Props) {
	if (pools.length < 2) return null;

	return (
		<div className={css.switch} role="tablist" aria-label="Pool">
			{pools.map((p) => (
				<button
					key={p.id}
					type="button"
					role="tab"
					aria-selected={value.id === p.id}
					className={`${css.tab} ${value.id === p.id ? css.on : ""}`}
					onClick={() => onChange(p)}
				>
					{p.label}
					{/* Неразвёрнутый пул помечаем до клика, а не после. */}
					{!p.deployed && <span className={css.soon}>soon</span>}
				</button>
			))}
		</div>
	);
}
