import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const KEY = "resu_theme";

const EVENT = "resu-theme";

export function currentTheme(): Theme {
	return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function setTheme(next: Theme): void {
	document.documentElement.dataset.theme = next;
	try {
		localStorage.setItem(KEY, next);
	} catch {
		/* private mode: the choice just won't survive a reload */
	}
	window.dispatchEvent(new CustomEvent<Theme>(EVENT, { detail: next }));
}

export function useTheme(): Theme {
	const [theme, set] = useState<Theme>(currentTheme);

	useEffect(() => {
		const onSwitch = (e: Event) => set((e as CustomEvent<Theme>).detail);
		window.addEventListener(EVENT, onSwitch);

		const media =
			typeof window.matchMedia === "function"
				? window.matchMedia("(prefers-color-scheme: dark)")
				: null;
		const onOs = (e: MediaQueryListEvent) => {
			let stored: string | null = null;
			try {
				stored = localStorage.getItem(KEY);
			} catch {
				/* unreadable storage counts as no choice */
			}
			if (stored === "light" || stored === "dark") return;
			const next: Theme = e.matches ? "dark" : "light";
			document.documentElement.dataset.theme = next;
			set(next);
		};
		media?.addEventListener("change", onOs);

		return () => {
			window.removeEventListener(EVENT, onSwitch);
			media?.removeEventListener("change", onOs);
		};
	}, []);

	return theme;
}
