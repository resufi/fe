import { driver, type DriveStep, type Driver } from "driver.js";
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
			description:
				"Three tiers over the same pool. Protected loses last and earns least. Aggressive takes the first loss and earns most. This choice is the whole product.",
		},
	},
];

const STAGE_PADDING = 4;

function fitStage(tour: Driver | undefined, el?: Element) {
	if (!tour || !el) return;

	const own = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
	const { height } = el.getBoundingClientRect();
	const pill = own > height / 2;
	const radius = Math.round(
		(pill ? height / 2 : own) + (pill ? STAGE_PADDING : STAGE_PADDING / 2),
	);

	if (tour.getConfig().stageRadius === radius) return;
	tour.setConfig({ ...tour.getConfig(), stageRadius: radius });
	tour.refresh();
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

	const tour = driver({
		steps: steps.map((step) => ({
			...step,
			disableActiveInteraction: true,
			onHighlightStarted: (el) => fitStage(tour, el),
		})),
		animate: !reduced,
		overlayColor: "var(--tour-overlay)",
		overlayOpacity: 1,
		stagePadding: STAGE_PADDING,
		stageRadius: 10,
		disableActiveInteraction: true,
		showProgress: true,
		progressText: "{{current}} / {{total}}",
		nextBtnText: "Next",
		prevBtnText: "Back",
		doneBtnText: "Done",
		popoverClass: "resu-tour",
		onDestroyed: remember,
	});

	tour.drive();
}
