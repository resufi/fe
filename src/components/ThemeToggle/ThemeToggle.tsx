import { useState } from "react";
import css from "./ThemeToggle.module.css";

type Theme = "light" | "dark";
const KEY = "resu_theme";

function current(): Theme {
	return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/**
 * Light/dark toggle. The initial theme is applied before React paints (an inline
 * script in index.html sets data-theme from storage or the OS), so there is no
 * flash; this button only flips and persists it.
 */
export function ThemeToggle() {
	const [theme, setTheme] = useState<Theme>(current);

	function toggle() {
		const next: Theme = theme === "dark" ? "light" : "dark";
		setTheme(next);
		document.documentElement.dataset.theme = next;
		try {
			localStorage.setItem(KEY, next);
		} catch {
			/* private mode: choice just won't persist */
		}
	}

	return (
		<button
			type="button"
			className={css.toggle}
			onClick={toggle}
			aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
			title="Toggle theme"
		>
			{theme === "dark" ? (
				// Sun
				<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
					<circle cx="12" cy="12" r="4" fill="currentColor" />
					<g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
						<path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
					</g>
				</svg>
			) : (
				// Moon
				<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
					<path
						fill="currentColor"
						d="M20 14.5A8 8 0 0 1 9.5 4a.75.75 0 0 0-1-.9A9 9 0 1 0 20.9 15.5a.75.75 0 0 0-.9-1Z"
					/>
				</svg>
			)}
		</button>
	);
}
