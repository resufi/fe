import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const KEY = "resu_theme";

/*
 * The theme lives on <html data-theme>, put there by the inline script in
 * index.html before React paints. This module is only the way to read it and
 * to change it — and the one place that tells everyone else it changed.
 *
 * It has to be shared: the toggle is not the only consumer. TonConnect carries
 * its own theme, and until it hears about the switch its wallet modal stays
 * light over a dark page.
 */
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

/** The current theme, re-rendering whatever asked whenever it changes. */
export function useTheme(): Theme {
	const [theme, set] = useState<Theme>(currentTheme);

	useEffect(() => {
		const onSwitch = (e: Event) => set((e as CustomEvent<Theme>).detail);
		window.addEventListener(EVENT, onSwitch);

		/*
		 * Nobody has chosen yet — follow the OS live. After the first click the
		 * choice is stored and the OS stops being the authority: that is what
		 * the stored value means.
		 */
		// This hook now runs at boot, above the provider: a missing matchMedia
		// (old WebViews, test environments) must not take the whole app down.
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
