import logo from "../../icons/flower-logo-light.svg";
import css from "./Logo.module.css";

export function Logo() {
	return (
		<img className={css.logo} src={logo} alt="" width={32} height={32} />
	);
}
