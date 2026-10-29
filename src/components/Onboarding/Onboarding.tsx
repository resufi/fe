import { useState } from "react";
import css from "./Onboarding.module.css";

const KEY = "resu_onboarding_dismissed_v1";

function wasDismissed(): boolean {
	try {
		return localStorage.getItem(KEY) === "1";
	} catch {
		return false;
	}
}

/**
 * A first-visit explainer: what Resu is, in one line, plus the three steps and a
 * plain-language tier key. Dismissible and remembered per browser, so it never
 * gets in the way of a returning user. Leads with the benefit, not the loss.
 */
export function Onboarding() {
	const [hidden, setHidden] = useState(wasDismissed);

	function dismiss() {
		setHidden(true);
		try {
			localStorage.setItem(KEY, "1");
		} catch {
			/* private mode: it simply shows again next visit */
		}
	}

	function reopen() {
		setHidden(false);
		try {
			localStorage.removeItem(KEY);
		} catch {
			/* ignore */
		}
	}

	// When dismissed, leave a quiet link in the same spot so it can be brought
	// back — a user who closed it by habit can always find it again.
	if (hidden) {
		return (
			<button type="button" className={css.reopen} onClick={reopen}>
				New here? Getting started
			</button>
		);
	}

	return (
		<section className={css.card}>
			<div className={css.top}>
				<h2 className={css.title}>Getting started</h2>
				<button className={css.close} onClick={dismiss} aria-label="Dismiss">
					Dismiss
				</button>
			</div>

			<p className={css.lead}>
				<b>Resu lets you choose your risk on any asset.</b> Deposit once and pick a tier — from
				protected, steady yield to high-upside.
			</p>

			<ol className={css.steps}>
				<li>
					<span className={css.num}>1</span>
					<span>
						<b>Pick a tier</b>
						<span className={css.sub}>Protected, Balanced, or Aggressive</span>
					</span>
				</li>
				<li>
					<span className={css.num}>2</span>
					<span>
						<b>Deposit</b>
						<span className={css.sub}>any supported asset, or pay with USDC</span>
					</span>
				</li>
				<li>
					<span className={css.num}>3</span>
					<span>
						<b>Earn</b>
						<span className={css.sub}>yield, plus points toward $RESU</span>
					</span>
				</li>
			</ol>

			<div className={css.key}>
				<span>
					<i className={css.dotSafe} /> <b>Protected</b> — loses last, steady yield
				</span>
				<span>
					<i className={css.dotMid} /> <b>Balanced</b> — a middle ground
				</span>
				<span>
					<i className={css.dotAgg} /> <b>Aggressive</b> — highest yield, takes the first loss
				</span>
			</div>
		</section>
	);
}
