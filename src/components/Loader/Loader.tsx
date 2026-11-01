import { useEffect, useLayoutEffect, useRef, useState } from "react";

import markup from "../../icons/resu-logo-loader.svg?raw";
import css from "./Loader.module.css";

const MARK = markup.replace(/<metadata>[\s\S]*?<\/metadata>/, "");

const SIGN = "Resu — results first, everything else later.";

const DELAY = 2;

const STEP = 0.03;

const CHAR_IN = 0.55;

const MARK_SETTLED = 6.72 * 0.667;

const SIGN_DONE = DELAY + (SIGN.length - 1) * STEP + CHAR_IN;

const HOLD_MS = Math.ceil(Math.max(MARK_SETTLED, SIGN_DONE) * 1000);

const FADE_MS = 500;

type Props = {
	ready: boolean;

	onDone: () => void;
};

export function Loader({ ready, onDone }: Props) {
	const [state, setState] = useState<"on" | "leaving" | "off">("on");
	const [held, setHeld] = useState(false);
	const markRef = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		const svg = markRef.current?.querySelector("svg");

		svg?.setCurrentTime?.(0);
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

		setState(reduced ? "off" : "leaving");
	}, [state, held, ready, reduced]);

	useEffect(() => {
		if (state !== "leaving") return;
		const t = window.setTimeout(() => setState("off"), FADE_MS + 100);
		return () => window.clearTimeout(t);
	}, [state]);

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
