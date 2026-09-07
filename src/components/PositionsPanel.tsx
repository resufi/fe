import { useState } from 'react';
import { useTonConnectUI, useTonAddress } from '@tonconnect/ui-react';
import { Address } from '@ton/core';
import { TRANCHES } from '../lib/config';
import { fmtAmount, fmtDuration, toGram } from '../lib/format';
import { burnMessage, claimMessage, BURN_TON, CLAIM_TON } from '../lib/payloads';
import { MyPosition, ProtocolData } from '../hooks/useProtocol';

type Props = { data: ProtocolData; withdrawDelay: number; onDone: () => void };

export function PositionsPanel({ data, withdrawDelay, onDone }: Props) {
    // Пустой блок «позиций нет» — это шум. Просто не показываем ничего.
    if (!data.wallet || data.wallet.positions.length === 0) {
        return null;
    }

    return (
        <section className="panel">
            <h2 className="section-title">Your positions</h2>
            <div className="positions">
                {data.wallet.positions.map((p) => (
                    <PositionRow
                        key={p.trancheId}
                        pos={p}
                        rate={data.rate}
                        withdrawDelay={withdrawDelay}
                        onDone={onDone}
                    />
                ))}
            </div>
        </section>
    );
}

function PositionRow({
    pos,
    rate,
    withdrawDelay,
    onDone,
}: {
    pos: MyPosition;
    rate: number | null;
    withdrawDelay: number;
    onDone: () => void;
}) {
    const [tonConnectUI] = useTonConnectUI();
    const wallet = useTonAddress();
    const [busy, setBusy] = useState(false);
    const meta = TRANCHES[pos.trancheId];

    const now = Math.floor(Date.now() / 1000);
    const matured = pos.pendingShares > 0n && now >= pos.unlockAt;
    const waiting = pos.pendingShares > 0n && !matured;

    async function send(to: Address, payload: string, ton: bigint) {
        setBusy(true);
        try {
            await tonConnectUI.sendTransaction({
                validUntil: Math.floor(Date.now() / 1000) + 300,
                messages: [{ address: to.toString(), amount: ton.toString(), payload }],
            });
            setTimeout(onDone, 6000);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className={`position position--${pos.trancheId}`}>
            <div className="position__main">
                <span className="muted small">{meta.name}</span>
                <div className="position__figures">
                    {/* GRAM первым числом намеренно: учёт ведётся в tsTON, и
                        рост самого tsTON в наши цифры не попадает. */}
                    <div className="num position__value">
                        {rate === null ? fmtAmount(pos.valueNow) : fmtAmount(toGram(pos.valueNow, rate))}
                        <span className="muted"> {rate === null ? 'tsTON' : 'GRAM'}</span>
                    </div>
                    <div className="muted small num">
                        {rate === null ? null : <>{fmtAmount(pos.valueNow, 4)} tsTON · </>}
                        {fmtAmount(pos.shares + pos.pendingShares, 4)} shares
                    </div>
                </div>
            </div>

            {waiting && (
                <p className="muted small">
                    {fmtAmount(pos.pendingShares, 4)} exiting · available in{' '}
                    {fmtDuration(pos.unlockAt - now)}
                </p>
            )}

            <div className="position__actions">
                {pos.shares > 0n && wallet && (
                    <button
                        className="btn btn--ghost"
                        disabled={busy}
                        onClick={() =>
                            send(
                                pos.shareWallet,
                                burnMessage(pos.shares, Address.parse(wallet)).toBoc().toString('base64'),
                                BURN_TON,
                            )
                        }
                    >
                        Withdraw
                    </button>
                )}
                {matured && (
                    <button
                        className="btn"
                        disabled={busy}
                        onClick={() => send(pos.ticket, claimMessage().toBoc().toString('base64'), CLAIM_TON)}
                    >
                        Claim
                    </button>
                )}
            </div>

            {pos.shares > 0n && pos.pendingShares === 0n && (
                <p className="muted small">
                    Shares are transferable · withdrawal takes {fmtDuration(withdrawDelay)}
                </p>
            )}
        </div>
    );
}
