import { driver, type Config, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import "../styles/tour.css";

const KEY = "resu_tour_done_v1";

const STEPS: DriveStep[] = [
	{
		element: '[data-tour="wallet"]',
		data: { pad: 2, shape: "pill" },
		popover: {
			title: "Connect a wallet",
			description:
				"Every chain here has its own wallet. The button changes with the network you are on - TON, Solana or an EVM one - and reading the pools works without connecting at all.",
		},
	},
	{
		element: '[data-tour="categories"]',
		data: { pad: 8, shape: 12 },
		popover: {
			title: "Start from what you are protecting",
			description:
				"Pick an asset type first: stablecoins, staking, tokenized stocks, crypto. The chain comes after - it is a detail of where the asset runs, not where you start.",
		},
	},
	{
		element: '[data-tour="chains"]',
		data: { pad: 8, shape: 12 },
		popover: {
			title: "Pick a network",
			description:
				"Inside a type, assets can sit on several chains. Only the chains that actually have this asset class are listed here.",
		},
	},
	{
		element: '[data-tour="pools"]',
		data: { pad: 6, shape: "pill" },
		popover: {
			title: "Pick a pool",
			description:
				"A pool is one asset with one set of rules. Switching pools changes everything below: the rates, the amounts and what you can deposit.",
		},
	},
	{
		element: '[data-tour="tiers"]',
		data: { pad: 8, shape: 12 },
		popover: {
			title: "Choose your place in the loss queue",
			side: "right",
			align: "start",
			description:
				"Three tiers over the same pool. Protected loses last and earns least. Aggressive takes the first loss and earns most. This choice is the whole product.",
		},
	},
];

const GUTTER = 12;

const DEFAULT_PAD = 0;

const DEFAULT_SHAPE = 10;

type Stage = { pad: number; radius: number };

function stageOf(el: Element, step: DriveStep): Stage {
	const pad = typeof step.data?.pad === "number" ? step.data.pad : DEFAULT_PAD;
	const shape = step.data?.shape ?? DEFAULT_SHAPE;
	const height = el.getBoundingClientRect().height + pad * 2;
	const radius =
		shape === "pill" ? Math.round(height / 2) : Math.round(Number(shape) + pad);
	return { pad, radius };
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
	} catch {}
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
		stagePadding: DEFAULT_PAD,
		stageRadius: DEFAULT_SHAPE,
		popoverOffset: 10,
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

	config.steps = steps.map((step) => ({
		...step,
		disableActiveInteraction: true,
		onHighlightStarted: (el, active) => {
			if (!el) return;
			const { pad, radius } = stageOf(el, active);
			const live = tour.getConfig();
			if (live.stagePadding === pad && live.stageRadius === radius) return;
			tour.setConfig({ ...config, stagePadding: pad, stageRadius: radius });
			tour.refresh();
		},
	}));

	const tour = driver(config);

	tour.drive();
}
