import { TrancheState } from '../lib/chain';
import { fmtAmount } from '../lib/format';

type Props = {
    tranches: TrancheState[];
    headroom: bigint;
    /** Подсветить транш при наведении на карточку. */
    highlight: number | null;
};

/**
 * Водопад потерь. Главное, что отличает нас от обычного ликвидного стейкинга:
 * убыток идёт снизу вверх и до senior может не дойти вовсе.
 *
 * Рисуем реальные пропорции капитала, а не декоративные блоки: если junior
 * тонкий, это должно быть видно, потому что тогда защита senior слабее.
 */
export function Waterfall({ tranches, headroom, highlight }: Props) {
    const [junior, mezz, senior] = tranches;
    const total = junior.totalAssets + mezz.totalAssets + senior.totalAssets;

    if (total === 0n) {
        return (
            <div className="waterfall waterfall--empty">
                <p>В пуле пока нет капитала. Первый депозit задаст пропорции траншей.</p>
            </div>
        );
    }

    const pct = (v: bigint) => Number((v * 10000n) / total) / 100;
    const rows = [
        { id: 2, name: 'Senior', assets: senior.totalAssets, order: 'третий' },
        { id: 1, name: 'Mezzanine', assets: mezz.totalAssets, order: 'второй' },
        { id: 0, name: 'Junior', assets: junior.totalAssets, order: 'первый' },
    ];

    // Докуда способен дойти убыток при текущей ёмкости.
    const headroomPct = Math.min(100, Number((headroom * 10000n) / total) / 100);

    return (
        <div className="waterfall">
            <div className="waterfall__head">
                <h3>Куда идёт убыток</h3>
                <p className="muted">Снизу вверх. Пока junior не обнулён, старшие транши не страдают.</p>
            </div>

            <div className="waterfall__stack">
                {rows.map((r) => (
                    <div
                        key={r.id}
                        className={`wf-row wf-row--${r.id} ${highlight === r.id ? 'is-hot' : ''}`}
                        style={{ flexGrow: Math.max(pct(r.assets), 4) }}
                    >
                        <span className="wf-row__name">{r.name}</span>
                        <span className="wf-row__meta">
                            {fmtAmount(r.assets)} · {pct(r.assets).toFixed(1)}%
                        </span>
                        <span className="wf-row__order">{r.order} в очереди</span>
                    </div>
                ))}
            </div>

            <div className="waterfall__gauge">
                <div className="gauge">
                    <div className="gauge__fill" style={{ width: `${headroomPct}%` }} />
                </div>
                <p className="muted">
                    Максимум, который протокол может списать сейчас — <b>{fmtAmount(headroom)}</b>{' '}
                    ({headroomPct.toFixed(1)}% пула). Выше этого убыток отвергается контрактом целиком.
                </p>
            </div>
        </div>
    );
}
