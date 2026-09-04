import { useState } from 'react';
import { TonConnectButton, useTonAddress } from '@tonconnect/ui-react';
import { deployment, isDeployed, TRANCHES } from './lib/config';
import { fmtAmount, fmtBps, fmtDuration, shortAddress } from './lib/format';
import { useProtocol } from './hooks/useProtocol';
import { hasApiKey } from './lib/chain';
import { TrancheCard } from './components/TrancheCard';
import { Waterfall } from './components/Waterfall';
import { DepositPanel } from './components/DepositPanel';
import { PositionsPanel } from './components/PositionsPanel';

export default function App() {
    const { data, error, loading, refresh, network } = useProtocol();
    const wallet = useTonAddress();
    const [selected, setSelected] = useState(0);
    const [hover, setHover] = useState<number | null>(null);

    return (
        <div className="app">
            <header className="topbar">
                <span className="brand">
                    Resu
                    {network === 'testnet' && <span className="chip">testnet</span>}
                </span>
                <TonConnectButton />
            </header>

            {/* Одна строка вместо абзаца: если продукт нельзя объяснить одной
                фразой, лишний текст этого не исправит. */}
            <h1 className="lede">
                Staking where you pick
                <br />
                your place in the loss queue.
            </h1>

            {!isDeployed ? (
                <NotDeployed />
            ) : !data ? (
                <p className="muted state">
                    {error ?? 'Loading…'}
                    {error && (
                        <button className="linkish" onClick={() => void refresh()}>
                            Retry
                        </button>
                    )}
                </p>
            ) : (
                <>
                    {(error || !hasApiKey) && (
                        <p className="muted small state">
                            {error
                                ? 'Data may be stale.'
                                : 'Public node is rate-limited, so reads are slow.'}
                            {!hasApiKey && ' A toncenter API key removes the limit.'}{' '}
                            <button className="linkish" onClick={() => void refresh()}>
                                Refresh
                            </button>
                        </p>
                    )}

                    <div className="tranches">
                        {TRANCHES.map((t) => (
                            <TrancheCard
                                key={t.id}
                                meta={t}
                                state={data.tranches[t.id]}
                                mandate={deployment.mandate}
                                rate={data.rate}
                                selected={selected === t.id}
                                onSelect={() => setSelected(t.id)}
                                onHover={setHover}
                            />
                        ))}
                    </div>

                    <div className="split">
                        <Waterfall
                            tranches={data.tranches}
                            headroom={data.headroom}
                            highlight={hover ?? selected}
                        />

                        <div className="stack">
                            {wallet ? (
                                <>
                                    <DepositPanel
                                        data={data}
                                        trancheId={selected}
                                        onDone={() => void refresh()}
                                    />
                                    <PositionsPanel
                                        data={data}
                                        withdrawDelay={data.vault.withdrawDelay}
                                        onDone={() => void refresh()}
                                    />
                                </>
                            ) : (
                                <p className="muted state">Connect a wallet to deposit.</p>
                            )}
                        </div>
                    </div>

                    <Details vault={data.vault} loading={loading} />
                </>
            )}
        </div>
    );
}

/**
 * Правила и адреса свёрнуты. Они важны, но не при каждом визите: человек,
 * который хочет их проверить, раскроет сам, а остальным они мешают.
 */
function Details({
    vault,
    loading,
}: {
    vault: { maxLossBps: number; withdrawDelay: number; principalDeposited: bigint; cumulativeLoss: bigint };
    loading: boolean;
}) {
    const m = deployment.mandate;
    return (
        <details className="details">
            <summary>Rules and addresses{loading ? ' · refreshing' : ''}</summary>

            <dl className="facts">
                <div>
                    <dt>Loss cap</dt>
                    <dd className="num">{fmtBps(vault.maxLossBps)}</dd>
                </div>
                <div>
                    <dt>Withdrawal</dt>
                    <dd className="num">{fmtDuration(vault.withdrawDelay)}</dd>
                </div>
                <div>
                    <dt>Senior fee</dt>
                    <dd className="num">{fmtBps(m.seniorFeeBps)}</dd>
                </div>
                <div>
                    <dt>Total deposited</dt>
                    <dd className="num">{fmtAmount(vault.principalDeposited)}</dd>
                </div>
                <div>
                    <dt>Losses applied</dt>
                    <dd className="num">{fmtAmount(vault.cumulativeLoss)}</dd>
                </div>
            </dl>

            <p className="muted small">
                The mandate is immutable: different rules mean a different vault, not an edit.
            </p>

            <ul className="addrs">
                <li>
                    Vault <code>{shortAddress(deployment.vault!)}</code>
                </li>
                <li>
                    Registry <code>{shortAddress(deployment.registry!)}</code>
                </li>
                <li>
                    Asset <code>{shortAddress(deployment.jettonMaster!)}</code>
                </li>
            </ul>
        </details>
    );
}

function NotDeployed() {
    return (
        <section className="panel">
            <h2 className="section-title">Protocol not deployed</h2>
            <p className="muted small">
                No addresses in <code>src/deployments/{deployment.network}.json</code>.
            </p>
            <pre className="code">
                <code>
                    npx blueprint run deployAll --{deployment.network}
                    {'\n'}cp deployments/{deployment.network}.json ../../frontend/src/deployments/
                </code>
            </pre>
        </section>
    );
}
