import markup from "../../icons/resu-flower.svg?raw";
import css from "./Logo.module.css";

/* Цветок Resu в родных цветах (тушь, крем, лавандовый лепесток) — одинаково в обеих темах. */
export function Logo() {
	return <span className={css.logo} aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />;
}
