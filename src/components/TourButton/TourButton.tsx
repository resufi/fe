import { startTour } from "../../lib/tour.ts";
import css from "./TourButton.module.css";

export function TourButton() {
	return (
		<button
			type="button"
			className={css.button}
			onClick={() => startTour()}
			aria-label="Show me around"
		>
			<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
				<circle
					cx="12"
					cy="12"
					r="9"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.6"
				/>
				<path
					d="M9.4 9.2a2.7 2.7 0 1 1 3.3 2.7c-.5.1-.8.5-.8 1v.6"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.6"
					strokeLinecap="round"
				/>
				<circle cx="12" cy="16.6" r="1" fill="currentColor" />
			</svg>
		</button>
	);
}
