import { TrancheState } from '../lib/chain';
import { Mandate, TrancheMeta } from '../lib/config';
import { fmtAmount, fmtBps, sharePrice } from '../lib/format';

type Props = {
    meta: TrancheMeta;
    state: TrancheState;
    mandate: Mandate;
    selected: boolean;
    onSelect: () => void;
    onHover: (id: number | null) => void;
};

/**
 * Ставка транша выражена относительно базовой доходности, а не абсолютным
 * числом: сам стейкинг-жетон растёт независимо от нас, и обещать конкретный
 * APY означало бы врать.
 */
function rateLabel(id: number, m: Mandate): { value: string; caption: string } {
    if (id === 2) {
        return {
            value: `−${fmtBps(m.seniorFeeBps)}`,
            caption: 'к базовой доходности — это цена защиты',
        };
    }
    if (id === 1) {
        const net = (m.seniorFeeBps * m.seniorFeeToMezzBps) / 10000 - m.mezzFeeBps;
        const sign = net >= 0 ? '+' : '−';
        return {
            value: `${sign}${fmtBps(Math.abs(net))}`,
            caption: 'доля платы senior за принятие второго убытка',
        };
    }
    return {
        value: 'остаток',
        caption: 'вся плата старших траншей — но первый убыток тоже ваш',
    };
}

export function TrancheCard({ meta, state, mandate, selected, onSelect, onHover }: Props) {
    const rate = rateLabel(meta.id, mandate);

    return (
        <button
            type="button"
            className={`card tranche tranche--${meta.id} ${selected ? 'is-selected' : ''}`}
            onClick={onSelect}
            onMouseEnter={() => onHover(meta.id)}
            onMouseLeave={() => onHover(null)}
            aria-pressed={selected}
        >
            <header className="tranche__head">
                <h3>{meta.name}</h3>
                <span className={`pill pill--${meta.id}`}>{meta.tagline}</span>
            </header>

            <div className="tranche__rate">
                <span className="tranche__rate-value">{rate.value}</span>
                <span className="muted">{rate.caption}</span>
            </div>

            <p className="tranche__blurb">{meta.blurb}</p>

            <dl className="kv">
                <div>
                    <dt>В транше</dt>
                    <dd className="num">{fmtAmount(state.totalAssets)}</dd>
                </div>
                <div>
                    <dt>Цена доли</dt>
                    <dd className="num">{sharePrice(state.totalAssets, state.totalShares)}</dd>
                </div>
            </dl>
        </button>
    );
}
