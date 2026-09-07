import logo from "../icons/flower-logo-light.svg";
import css from "./Logo.module.css";

/**
 * Знак марки. Тема в приложении одна, светлая, поэтому вариант ровно один.
 *
 * Пустой alt — намеренно: рядом стоит слово «Resu», и озвучивать марку дважды
 * скринридеру незачем.
 */
export function Logo() {
	return (
		<img className={css.logo} src={logo} alt="" width={32} height={32} />
	);
}
