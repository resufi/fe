import mark from "../icons/resu-logo-loader.svg";
import css from "./Loader.module.css";

const SIGN = "Resu — results first, everything else later.";
/** Когда вступает первая буква: знак к этому моменту уже дорисован. */
const DELAY = 2;
/** Шаг между буквами. Набегает ~1.3 с на всю строку — быстрее чтения. */
const STEP = 0.03;

/**
 * Заставка на время загрузки: анимация знака нарисована внутри самого SVG
 * (SMIL), поэтому она крутится сама и её не нужно синхронизировать с React.
 *
 * Подпись набирается по букве и ровно один раз — в отличие от знака, она не
 * зациклена: строка, мигающая заново каждые семь секунд, читалась бы как
 * ошибка.
 */
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

			{/* Скринридеру строка отдаётся целиком: посимвольная разметка для
			    него была бы набором одиночных букв. */}
			<p className={css.sign} aria-label={SIGN}>
				{[...SIGN].map((ch, i) => (
					<span
						// Индекс — законный ключ: строка неизменна, буквы не
						// переставляются и не добавляются.
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
