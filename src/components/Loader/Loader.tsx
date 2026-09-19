import mark from "../../icons/resu-logo-loader.svg";
import css from "./Loader.module.css";

const SIGN = "Resu — results first, everything else later.";

const DELAY = 2;

const STEP = 0.03;

export function Loader() {
	return (
		<div
			className={css.screen}
			data-loader
			role="status"
			aria-busy="true"
			aria-label="Loading pool"
		>
			<img className={css.mark} src={mark} alt="" />

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
