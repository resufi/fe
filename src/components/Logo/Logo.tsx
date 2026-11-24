import markup from "../../icons/resu-flower.svg?raw";
import css from "./Logo.module.css";

export function Logo() {
	return (
		<span
			className={css.logo}
			aria-hidden="true"
			dangerouslySetInnerHTML={{ __html: markup }}
		/>
	);
}
