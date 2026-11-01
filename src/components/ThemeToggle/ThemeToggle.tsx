import { setTheme, useTheme } from "../../hooks/useTheme.ts";
import css from "./ThemeToggle.module.css";

export function ThemeToggle() {
	const theme = useTheme();
	const dark = theme === "dark";

	return (
		<button
			type="button"
			className={css.toggle}
			onClick={() => setTheme(dark ? "light" : "dark")}
			aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
		>
			{dark ? (

				<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
					<circle cx="12" cy="12" r="4" fill="currentColor" />
					<g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
						<path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
					</g>
				</svg>
			) : (

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
