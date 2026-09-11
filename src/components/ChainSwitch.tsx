import { CHAIN_LIST, type ChainId } from "../lib/chains.ts";
import css from "./ChainSwitch.module.css";

type Props = { value: ChainId; onChange: (id: ChainId) => void };

export function ChainSwitch({ value, onChange }: Props) {
	const active = Math.max(
		0,
		CHAIN_LIST.findIndex((c) => c.id === value),
	);

	return (
		<div
			className={css.switch}
			role="tablist"
			aria-label="Network"
			style={{
				["--n" as string]: CHAIN_LIST.length,
				["--i" as string]: active,
			}}
		>
			{/* Бегунок — оформление, а не содержание: скринридер читает вкладки
			    и их aria-selected, а эту плашку не должен видеть вовсе. */}
			<span className={css.thumb} aria-hidden="true" />

			{CHAIN_LIST.map((c) => (
				<button
					key={c.id}
					type="button"
					role="tab"
					aria-selected={value === c.id}
					className={`${css.tab} ${value === c.id ? css.on : ""}`}
					onClick={() => onChange(c.id)}
				>
					{c.name}
					{/* Помечаем неразвёрнутую сеть сразу, а не после клика:
					    выбрать её можно, но ожидания честнее задать заранее. */}
					{!c.deployed && <span className={css.soon}>soon</span>}
				</button>
			))}
		</div>
	);
}
