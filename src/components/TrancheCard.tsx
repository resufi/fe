import { TrancheState } from '../lib/chain';
import { Mandate, TrancheMeta } from '../lib/config';
import { fmtAmount, fmtBps, toGram } from '../lib/format';

type Props = {
    meta: TrancheMeta;
    state: TrancheState;
    mandate: Mandate;
    rate: number | null;
    selected: boolean;
    onSelect: () => void;
    onHover: (id: number | null) => void;
};

/**
 * Ставка выражена относительно базовой доходности, а не абсолютным APY:
 * стейкинг-жетон растёт сам по себе, и обещать конкретный процент было бы
 * враньём.
 */
function feeLabel(id: number, m: Mandate): string {
    if (id === 2) return `−${fmtBps(m.seniorFeeBps)}`;
    if (id === 1) {
        const net = (m.seniorFeeBps * m.seniorFeeToMezzBps) / 10000 - m.mezzFeeBps;
        return `${net >= 0 ? '+' : '−'}${fmtBps(Math.abs(net))}`;
    }
    return 'remainder';
}

export function TrancheCard({ meta, state, mandate, rate, selected, onSelect, onHover }: Props) {
    return (
        <button
            type="button"
            className={`tranche t${meta.id} ${selected ? 'is-on' : ''}`}
            onClick={onSelect}
            onMouseEnter={() => onHover(meta.id)}
            onMouseLeave={() => onHover(null)}
            aria-pressed={selected}
        >
            <span className="tranche__name">
                <i className="dot" aria-hidden="true" />
                {meta.name}
            </span>
            <span className="tranche__rate num">{feeLabel(meta.id, mandate)}</span>
            <span className="tranche__order">{meta.order}</span>
            <span className="tranche__pool num">
                {rate === null
                    ? `${fmtAmount(state.totalAssets)} tsTON`
                    : `${fmtAmount(toGram(state.totalAssets, rate))} GRAM`}
            </span>
        </button>
    );
}
