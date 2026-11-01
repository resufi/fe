import { setTheme, useTheme } from "../../hooks/useTheme.ts";
import css from "./ThemeToggle.module.css";

/**
 * Light/dark switch: a round button with no border.
 *
 * The icon shows what a click would bring — a sun in the dark theme, a moon in
 * the light one. The frame is gone and the shape is a full circle, so the
 * header holds no third geometry; what holds the button together instead is a
 * faint brand-coloured shadow, the same idiom that marks a selected pool.
 *
 * The initial theme is applied before React paints (an inline script in
 * index.html sets data-theme from storage or the OS), so there is no flash.
 */
export function ThemeToggle() {
	const theme = useTheme();
	const dark = theme === "dark";

	/*
	 * The label is an aria-label and not a title: a title brings the browser's
	 * own tooltip, which drops in a second after the cursor stops, in the
	 * system's font and its own box — a panel from another interface over
	 * ours. Screen readers get the label either way.
	 */

	return (
		<button
			type="button"
			className={css.toggle}
			onClick={() => setTheme(dark ? "light" : "dark")}
			aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
		>
			{dark ? (
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
