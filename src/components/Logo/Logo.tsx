import css from "./Logo.module.css";

export function Logo() {
	return (
		<svg
			className={css.logo}
			viewBox="0 0 237.06 250.34"
			width={40}
			height={40}
			fill="none"
			stroke="var(--logo-stroke)"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path
				d="M131.84 144.81C146.79 100.21 193.26 81.43 234.56 111.44C218.79 159.99 170.15 172.11 131.84 144.81Z"
				fill="var(--logo-fill)"
			/>
			<path
				d="M126.76 160.47C173.8 160.9 206.02 199.29 190.24 247.84C139.19 247.85 112.64 205.34 126.76 160.47Z"
				fill="var(--logo-fill)"
			/>
			<path
				d="M110.3 160.47C124.42 205.34 97.87 247.85 46.82 247.84C31.04 199.29 63.26 160.9 110.3 160.47Z"
				fill="var(--logo-fill)"
			/>
			<path
				d="M105.21 144.81C66.9 172.11 18.27 159.99 2.5 111.44C43.79 81.43 90.27 100.21 105.21 144.81Z"
				fill="var(--logo-fill)"
			/>
			<path
				d="M118.53 108.14C87.38 72.89 94.35 23.26 140.98 2.5C175.14 40.43 161.32 88.61 118.53 108.14Z"
				fill="var(--logo-brand)"
			/>
			<circle cx="118.53" cy="149.14" r="28" fill="var(--logo-fill)" />
		</svg>
	);
}
