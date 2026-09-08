import { CHAINS, type ChainId } from "../lib/chains.ts";
import css from "./ChainNotReady.module.css";

/**
 * Сеть выбрана, но протокол в ней не развёрнут.
 *
 * Показываем это прямо, вместо нулей и пустых карточек: выдуманные данные
 * на месте отсутствующих — худший способ сообщить, что чего-то нет.
 */
export function ChainNotReady({ chain }: { chain: ChainId }) {
	const c = CHAINS[chain];
	return (
		<section className={css.box}>
			<h2 className={css.title}>{c.name} is not live yet</h2>
			<p className="muted">
				The contracts are written and the economics are covered by tests, but
				nothing is deployed on {c.name} yet — so there is nothing to show.
			</p>
			<dl className={css.facts}>
				<div>
					<dt>Base asset</dt>
					<dd>{c.asset}</dd>
				</div>
				<div>
					<dt>Loss cap</dt>
					<dd className="num">{c.mandate.maxLossBps / 100}%</dd>
				</div>
				<div>
					<dt>Withdrawal</dt>
					<dd className="num">{Math.round(c.mandate.withdrawDelay / 86400)} days</dd>
				</div>
				<div>
					<dt>Senior fee</dt>
					<dd className="num">{c.mandate.seniorFeeBps / 100}%</dd>
				</div>
			</dl>
		</section>
	);
}
