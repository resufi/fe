import { useState } from 'react';
import { TonConnectButton, useTonAddress } from '@tonconnect/ui-react';
import { deployment, isDeployed, TRANCHES } from './lib/config';
import { fmtAmount, fmtBps, fmtDuration, shortAddress } from './lib/format';
import { useProtocol } from './hooks/useProtocol';
import { TrancheCard } from './components/TrancheCard';
import { Waterfall } from './components/Waterfall';
import { DepositPanel } from './components/DepositPanel';
import { PositionsPanel } from './components/PositionsPanel';

export default function App() {
    const { data, error, loading, refresh, network } = useProtocol();
    const wallet = useTonAddress();
    const [selected, setSelected] = useState(0);
    const [hover, setHover] = useState<number | null>(null);
    const m = deployment.mandate;

    return (
        <div className="app">
            <header className="topbar">
                <div className="brand">
                    <span className="brand__mark" aria-hidden="true" />
                    <span className="brand__name">Resu</span>
                    {network === 'testnet' && <span className="chip">testnet</span>}
                </div>
                <TonConnectButton />
            </header>

            <main>
                <section className="hero">
                    <h1>Стейкинг с понятным лимитом потерь</h1>
                    <p>
                        Обычный ликвидный стейкинг размазывает убыток по всем держателям поровну.
                        Здесь вы выбираете своё место в очереди на убыток — и знаете его заранее,
                        потому что оно записано в контракте, а не в блоге.
                    </p>
                </section>

                {!isDeployed ? (
                    <NotDeployed />
                ) : !data ? (
                    <div className="card panel">
                        <p className="muted">{error ?? 'Читаю состояние протокола…'}</p>
                        {error && (
                            <button className="btn btn--ghost" onClick={() => void refresh()}>
                                Повторить
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        {error && (
                            <div className="banner banner--warn">
                                Данные могли устареть: {error}
                                <button className="btn btn--ghost" onClick={() => void refresh()}>
                                    Обновить
                                </button>
                            </div>
                        )}

                        <section className="tranches">
                            {TRANCHES.map((t) => (
                                <TrancheCard
                                    key={t.id}
                                    meta={t}
                                    state={data.tranches[t.id]}
                                    mandate={m}
                                    selected={selected === t.id}
                                    onSelect={() => setSelected(t.id)}
                                    onHover={setHover}
                                />
                            ))}
                        </section>

                        <div className="split">
                            <div className="card">
                                <Waterfall
                                    tranches={data.tranches}
                                    headroom={data.headroom}
                                    highlight={hover ?? selected}
                                />
                            </div>

                            <div className="stack">
                                {wallet ? (
                                    <>
                                        <DepositPanel data={data} trancheId={selected} onDone={() => void refresh()} />
                                        <PositionsPanel
                                            data={data}
                                            withdrawDelay={data.vault.withdrawDelay}
                                            onDone={() => void refresh()}
                                        />
                                    </>
                                ) : (
                                    <section className="card panel">
                                        <h3>Подключите кошелёк</h3>
                                        <p className="muted">
                                            Чтобы внести депозит и увидеть свои позиции, подключите TON-кошелёк
                                            кнопкой наверху.
                                        </p>
                                    </section>
                                )}
                            </div>
                        </div>

                        <section className="card panel">
                            <h3>Правила, которые нельзя изменить после запуска</h3>
                            <dl className="kv kv--wide">
                                <div>
                                    <dt>Потолок потерь</dt>
                                    <dd className="num">{fmtBps(data.vault.maxLossBps)}</dd>
                                    <span className="muted small">
                                        от внесённого капитала. Убыток сверх потолка контракт отвергает целиком.
                                    </span>
                                </div>
                                <div>
                                    <dt>Окно выхода</dt>
                                    <dd className="num">{fmtDuration(data.vault.withdrawDelay)}</dd>
                                    <span className="muted small">
                                        нужно, чтобы выход не мог опередить убыток.
                                    </span>
                                </div>
                                <div>
                                    <dt>Плата senior</dt>
                                    <dd className="num">{fmtBps(m.seniorFeeBps)}</dd>
                                    <span className="muted small">
                                        годовых, из них {fmtBps(m.seniorFeeToMezzBps)} достаётся mezzanine.
                                    </span>
                                </div>
                                <div>
                                    <dt>Списано убытка</dt>
                                    <dd className="num">{fmtAmount(data.vault.cumulativeLoss)}</dd>
                                    <span className="muted small">
                                        всего внесено {fmtAmount(data.vault.principalDeposited)}.
                                    </span>
                                </div>
                            </dl>
                            <p className="muted small">
                                Мандат неизменяем. Нужен другой профиль риска — это будет другой vault,
                                а не правка этого.
                                {loading && ' · обновляю…'}
                            </p>
                        </section>

                        <footer className="footer">
                            <span className="muted small">
                                Vault <code>{shortAddress(deployment.vault!)}</code> · Registry{' '}
                                <code>{shortAddress(deployment.registry!)}</code> · базовый актив{' '}
                                <code>{shortAddress(deployment.jettonMaster!)}</code>
                            </span>
                        </footer>
                    </>
                )}
            </main>
        </div>
    );
}

function NotDeployed() {
    return (
        <section className="card panel">
            <h3>Протокол ещё не развёрнут</h3>
            <p className="muted">
                В <code>src/deployments/{deployment.network}.json</code> нет адресов контрактов.
                Разверните протокол и положите туда файл, который создаст скрипт:
            </p>
            <pre className="code">
                <code>
                    cd resu-sc-ton/resu-sc-ton{'\n'}
                    npx blueprint run deployAll --testnet{'\n'}
                    cp deployments/testnet.json ../../frontend/src/deployments/
                </code>
            </pre>
            <p className="muted small">
                Интерфейс намеренно не притворяется работающим на выдуманных данных.
            </p>
        </section>
    );
}
