import { useState, type ReactNode } from "react";
import css from "./Tabs.module.css";

export type Tab = { id: string; label: string; content: ReactNode };

/**
 * A small underline tab strip for the action area — one way to deposit shown at
 * a time (single tier, one-click profiles, index) instead of a tall stack.
 */
export function Tabs({ tabs }: { tabs: Tab[] }) {
	const [active, setActive] = useState(tabs[0]?.id ?? "");
	const current = tabs.find((t) => t.id === active) ?? tabs[0];
	if (!current) return null;

	return (
		<div className={css.wrap}>
			<div className={css.strip} role="tablist">
				{tabs.map((t) => (
					<button
						key={t.id}
						type="button"
						role="tab"
						aria-selected={t.id === current.id}
						className={`${css.tab} ${t.id === current.id ? css.on : ""}`}
						onClick={() => setActive(t.id)}
					>
						{t.label}
					</button>
				))}
			</div>
			<div className={css.body}>{current.content}</div>
		</div>
	);
}
