import { setTheme, useTheme } from "../../hooks/useTheme.ts";
import css from "./ThemeToggle.module.css";

/**
 * Light/dark switch: one petal, no box.
 *
 * It used to be a 34×34 bordered square with a sun and a moon — the most
 * generic control an interface can have, and in this header the only element
 * shaped like a widget: the wallet is a pill, the chains are bare text with an
 * underline. A glyph without a frame leaves the header two shapes instead of
 * three, and a setting stops weighing as much as the button people came for.
 *
 * The petal is the one from our own mark, two centimetres to the left: an
 * outline in the light theme, filled with the brand colour in the dark one. It
 * shows the current state, not the one a click would bring — the sun/moon pair
 * never said which of the two it meant.
 *
 * The initial theme is applied before React paints (an inline script in
 * index.html sets data-theme from storage or the OS), so there is no flash.
 */
export function ThemeToggle() {
	const theme = useTheme();
	const dark = theme === "dark";

	return (
		<button
			type="button"
			className={css.toggle}
			onClick={() => setTheme(dark ? "light" : "dark")}
			aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
			title="Toggle theme"
		>
			<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
				<path
					className={css.petal}
					d="M12 3C16.2 7.2 16.2 13.4 12 19C7.8 13.4 7.8 7.2 12 3Z"
					fill={dark ? "var(--brand)" : "none"}
					stroke="currentColor"
					strokeWidth="1.6"
					strokeLinejoin="round"
				/>
			</svg>
		</button>
	);
}
