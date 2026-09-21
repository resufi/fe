import { CHAIN_LIST, type ChainId } from "../../lib/chains.ts";
import type { Pool } from "../../lib/pools.ts";
import css from "./PoolControls.module.css";

type Props = {
	chain: ChainId;
	onChainChange: (id: ChainId) => void;
	pools: Pool[];
	pool: Pool;
	onPoolChange: (p: Pool) => void;
};

/**
 * Сеть и пул блоками, друг под другом.
 *
 * Прежние вкладки с бегунком не пережили роста: бегунок считался от числа
 * элементов и требовал, чтобы все они помещались в один ряд равной ширины.
 * Блоки не связаны друг с другом — ряд просто переносится.
 *
 * Сеть и пул различаются формой, а не только местом: сеть — подпись с
 * подчёркиванием, пул — пилюля. Раньше оба ряда были пилюлями и путались
 * между собой.
 *
 * Пул показывается даже когда он в сети один. Вкладка-одиночка ничего не
 * выбирала и потому пряталась, но блок — это ещё и подпись: он говорит, во
 * что кладут деньги, и на Hyperliquid с Solana иначе на экране не остаётся
 * ничего, кроме названия сети.
 */
export function PoolControls({
	chain,
	onChainChange,
	pools,
	pool,
	onPoolChange,
}: Props) {
	return (
		<div className={css.rows}>
			<div className={css.row} role="radiogroup" aria-label="Network">
				{CHAIN_LIST.map((c) => (
					<button
						key={c.id}
						type="button"
						role="radio"
						aria-checked={chain === c.id}
						className={`${css.chain} ${chain === c.id ? css.chainOn : ""}`}
						onClick={() => onChainChange(c.id)}
					>
						{c.name}
						{/* Недоступное помечаем до клика, а не после. */}
						{!c.deployed && <span className={css.soon}>soon</span>}
					</button>
				))}
			</div>

			<div className={css.row} role="radiogroup" aria-label="Pool">
				{pools.map((p) => (
					<button
						key={p.id}
						type="button"
						role="radio"
						aria-checked={pool.id === p.id}
						className={`${css.block} ${pool.id === p.id ? css.on : ""}`}
						onClick={() => onPoolChange(p)}
					>
						{p.label}
						{!p.deployed && <span className={css.soon}>soon</span>}
					</button>
				))}
			</div>
		</div>
	);
}
