import { useEffect, useLayoutEffect, useRef, useState } from "react";

import markup from "../../icons/resu-logo-loader.svg?raw";
import css from "./Loader.module.css";

/*
 * The mark goes into the document as markup, not through `<img src>`.
 *
 * Inside an `<img>` the SVG keeps its own timeline, and the browser attaches
 * that timeline to the image it cached under the file URL — not to our mount.
 * On a reload the cached document came back frozen mid-cycle, with every petal
 * already drawn, so the first painted frame was a finished logo; then the
 * timeline reset and the drawing started over. Inline there is no such cache:
 * the base state is an empty group, and that is what paints first.
 *
 * The c2pa provenance block is 7.9 of the file's 11 KB and means nothing in
 * the DOM, so it is dropped here rather than in the file — the same asset is
 * shared with the landing page and the mini app.
 */
const MARK = markup.replace(/<metadata>[\s\S]*?<\/metadata>/, "");

const SIGN = "Resu — results first, everything else later.";

const DELAY = 2;

const STEP = 0.03;

const CHAR_IN = 0.55;

/*
 * Logo settles 6.72s into its own SVG animation, two thirds of the way in.
 * The number lives here because the mark is a file, not markup we can time.
 */
const MARK_SETTLED = 6.72 * 0.667;

const SIGN_DONE = DELAY + (SIGN.length - 1) * STEP + CHAR_IN;

/*
 * The screen holds until its own animation is finished, not for a round
 * number of milliseconds: the figure is derived from the mark and the
 * signature, so editing either one moves the hold with it.
 */
const HOLD_MS = Math.ceil(Math.max(MARK_SETTLED, SIGN_DONE) * 1000);

const FADE_MS = 500;

type Props = {
	/** Pool data has arrived (or failed) — the screen may leave. */
	ready: boolean;
	/** Fired once the screen is gone for good. */
	onDone: () => void;
};

/**
 * Opening screen: the mark drawing itself, then the signature typing out.
 *
 * It owns its own exit. The app renders underneath from the first frame and
 * the screen fades off the top, so the switch is one transition instead of a
 * cut between two different layouts.
 *
 * Two clocks have to agree before it leaves: its own animation has to finish
 * (`HOLD_MS`), and the pool data has to arrive (`ready`). Whichever is later
 * decides — a fast node must not cut the animation short, and a slow one must
 * not hand over an empty page.
 */
export function Loader({ ready, onDone }: Props) {
	const [state, setState] = useState<"on" | "leaving" | "off">("on");
	const [held, setHeld] = useState(false);
	const markRef = useRef<HTMLDivElement>(null);

	/*
	 * Inline SMIL runs on the document timeline, which started when the page
	 * did — by the time React mounts, the first petals are already in the
	 * past and would snap to their frozen, drawn state. Rewinding the mark's
	 * own timeline to zero is what makes the animation start from the start,
	 * every load, whatever the boot took.
	 *
	 * Before paint, not after: an effect that runs late lets one frame of the
	 * half-drawn mark through, which is the very flash we are removing.
	 */
	useLayoutEffect(() => {
		const svg = markRef.current?.querySelector("svg");
		svg?.setCurrentTime(0);
	}, []);

	const reduced =
		typeof window !== "undefined" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	useEffect(() => {
		const t = window.setTimeout(() => setHeld(true), reduced ? 200 : HOLD_MS);
		return () => window.clearTimeout(t);
	}, [reduced]);

	useEffect(() => {
		if (state !== "on" || !held || !ready) return;
		/*
		 * With motion off we leave at once: tokens.css kills transitions with
		 * !important, so transitionend never fires, and waiting for it would
		 * pin an invisible screen over the page forever.
		 */
		setState(reduced ? "off" : "leaving");
	}, [state, held, ready, reduced]);

	// Insurance against a lost transitionend: leave on the clock instead.
	useEffect(() => {
		if (state !== "leaving") return;
		const t = window.setTimeout(() => setState("off"), FADE_MS + 100);
		return () => window.clearTimeout(t);
	}, [state]);

	// The page is already underneath — too early to scroll it.
	useEffect(() => {
		if (state === "off") return;
		const html = document.documentElement;
		const before = html.style.overflow;
		html.style.overflow = "hidden";
		return () => {
			html.style.overflow = before;
		};
	}, [state]);

	useEffect(() => {
		if (state === "off") onDone();
	}, [state, onDone]);

	if (state === "off") return null;

	return (
		<div
			className={`${css.screen} ${state === "leaving" ? css.leaving : ""}`}
			data-loader
			role="status"
			aria-busy={state === "on"}
			aria-label="Loading pool"
			onTransitionEnd={() => setState("off")}
		>
			<div
				ref={markRef}
				className={css.mark}
				aria-hidden="true"
				dangerouslySetInnerHTML={{ __html: MARK }}
			/>

			<p className={css.sign} aria-label={SIGN}>
				{[...SIGN].map((ch, i) => (
					<span
						key={i}
						className={css.char}
						style={{ animationDelay: `${DELAY + i * STEP}s` }}
						aria-hidden="true"
					>
						{ch}
					</span>
				))}
			</p>
		</div>
	);
}
