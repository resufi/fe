import { TrancheState } from '../lib/chain';
import { fmtAmount } from '../lib/format';

type Props = {
    tranches: TrancheState[];
    headroom: bigint;
    highlight: number | null;
};

/**
 * Водопад потерь — то единственное, чего не показывает обычный ликвидный
 * стейкинг, потому что там убыток размазан поровну и показывать нечего.
 *
 * Полосы рисуются в реальных пропорциях капитала: если junior тонкий, это
 * должно быть видно — тогда защита senior слабее.
 */
export function Waterfall({ tranches, headroom, highlight }: Props) {
    const [junior, mezz, senior] = tranches;
    const total = junior.totalAssets + mezz.totalAssets + senior.totalAssets;

    if (total === 0n) {
        return (
            <div className="wf wf--empty">
                <h2 className="section-title">Loss waterfall</h2>
                <p className="muted">Pool is empty. The first deposit sets the proportions.</p>
            </div>
        );
    }

    const pct = (v: bigint) => Number((v * 10000n) / total) / 100;
    const rows = [
        { id: 2, name: 'Senior', assets: senior.totalAssets },
        { id: 1, name: 'Mezzanine', assets: mezz.totalAssets },
        { id: 0, name: 'Junior', assets: junior.totalAssets },
    ];
    const headroomPct = Math.min(100, Number((headroom * 10000n) / total) / 100);

    return (
        <div className="wf">
            <h2 className="section-title">
                Loss waterfall
                <span className="muted"> — bottom up</span>
            </h2>

            <div className="wf__stack">
                {rows.map((r) => (
                    <div
                        key={r.id}
                        className={`wf__row t${r.id} ${highlight === r.id ? 'is-on' : ''}`}
                        style={{ flexGrow: Math.max(pct(r.assets), 6) }}
                    >
                        <span>{r.name}</span>
                        <span className="num muted">{fmtAmount(r.assets)}</span>
                    </div>
                ))}
            </div>

            <div className="wf__cap">
                <div className="bar">
                    <div className="bar__fill" style={{ width: `${headroomPct}%` }} />
                </div>
                <p className="muted small">
                    Maximum writedown: <span className="num">{fmtAmount(headroom)}</span>. Above
                    that the contract rejects the loss outright.
                </p>
            </div>
        </div>
    );
}
