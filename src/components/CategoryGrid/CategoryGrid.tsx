import type { CategoryId } from "../../lib/categories.ts";
import { CATEGORIES } from "../../lib/categories.ts";
import css from "./CategoryGrid.module.css";

type Props = {
	active: CategoryId | null;
	onPick: (id: CategoryId) => void;
};

/**
 * The front door: choose an asset class, not a chain.
 *
 * Chain is a detail of where the asset runs; a person looking for stocks starts
 * here and never has to know the underlying network.
 */
export function CategoryGrid({ active, onPick }: Props) {
	return (
		<div className={css.grid} role="list" data-tour="categories">
			{CATEGORIES.map((c) => (
				<button
					key={c.id}
					type="button"
					role="listitem"
					className={`${css.card} ${active === c.id ? css.on : ""}`}
					aria-pressed={active === c.id}
					onClick={() => onPick(c.id)}
				>
					<span className={css.label}>{c.label}</span>
					<span className={css.blurb}>{c.blurb}</span>
					<span className={css.risk}>
						<span>{c.senior}</span>
						<span>{c.junior}</span>
					</span>
				</button>
			))}
		</div>
	);
}
