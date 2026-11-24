import { driver, type Config, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import "../styles/tour.css";

const KEY = "resu_tour_done_v1";

const STEPS: DriveStep[] = [
	{
		element: '[data-tour="wallet"]',
		popover: {
			title: "Connect a wallet",
			description:
				"Every chain here has its own wallet. The button changes with the network you are on - TON, Solana or an EVM one - and reading the pools works without connecting at all.",
		},
	},
	{
		element: '[data-tour="chains"]',
		popover: {
			title: "Pick a network",
			description:
				"The same product on seven chains. Each one holds different assets: tokenized stocks on Base and Robinhood, WETH on Arbitrum, staking tokens on TON and Solana.",
		},
	},
	{
		element: '[data-tour="pools"]',
		popover: {
			title: "Pick a pool",
			description:
				"A pool is one asset with one set of rules. Switching pools changes everything below: the rates, the amounts and what you can deposit.",
		},
	},
	{
		element: '[data-tour="tiers"]',
		popover: {
			title: "Choose your place in the loss queue",
			side: "right",
			align: "start",
			description:
				"Three tiers over the same pool. Protected loses last and earns least. Aggressive takes the first loss and earns most. This choice is the whole product.",
		},
	},
];

const STAGE_PADDING = 0;

const GUTTER = 12;

const MIN_RADIUS = 10;

function radiusOf(el: Element): number {
	const own = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
	const { height } = el.getBoundingClientRect();
	return Math.round(own > height / 2 ? height / 2 : Math.max(own, MIN_RADIUS));
}

export function tourSeen(): boolean {
	try {
		return localStorage.getItem(KEY) === "1";
	} catch {
		return false;
	}
}

function remember() {
	try {
		localStorage.setItem(KEY, "1");
	} catch {
		/* private mode: the tour simply offers itself again */
	}
}

export function startTour(): void {
	const steps = STEPS.filter(
		(s) => typeof s.element === "string" && document.querySelector(s.element),
	);
	if (steps.length === 0) return;

	const reduced =
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	document.documentElement.style.setProperty(
		"--tour-scrollbar",
		`${Math.max(0, window.innerWidth - document.documentElement.clientWidth)}px`,
	);

	const config: Config = {
		animate: !reduced,
		overlayColor: "var(--tour-overlay)",
		overlayOpacity: 1,
		stagePadding: STAGE_PADDING,
		stageRadius: MIN_RADIUS,
		popoverOffset: 14,
		showProgress: true,
		progressText: "{{current}} / {{total}}",
		nextBtnText: "Next",
		prevBtnText: "Back",
		doneBtnText: "Done",
		popoverClass: "resu-tour",
		onPopoverPositioned: (popover) => {
			const el = popover.wrapper;
			el.style.setProperty("--tour-nudge", "0px");
			const box = el.getBoundingClientRect();
			const vw = document.documentElement.clientWidth;
			let dx = 0;
			if (box.right > vw - GUTTER) dx = vw - GUTTER - box.right;
			if (box.left + dx < GUTTER) dx = GUTTER - box.left;
			if (dx !== 0) el.style.setProperty("--tour-nudge", `${Math.round(dx)}px`);
		},
		onDestroyed: remember,
	};

	/*
	 * The radius is the element's own, so the cutout repeats its shape instead
	 * of approximating it. It has to be set on the config, which driver takes
	 * whole — hence the spread of our own object: spreading getConfig() back
	 * quietly dropped the other options.
	 */
	config.steps = steps.map((step) => ({
		...step,
		disableActiveInteraction: true,
		onHighlightStarted: (el) => {
			if (!el) return;
			const stageRadius = radiusOf(el);
			if (tour.getConfig().stageRadius === stageRadius) return;
			tour.setConfig({ ...config, stageRadius });
			tour.refresh();
		},
	}));

	const tour = driver(config);

	tour.drive();
}
