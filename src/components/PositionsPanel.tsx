import { useState } from 'react';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { TRANCHES } from '../lib/config';
import { fmtAmount, fmtDuration } from '../lib/format';
import { withdrawClaimMessage, withdrawRequestMessage, WITHDRAW_CLAIM_TON, WITHDRAW_REQUEST_TON } from '../lib/payloads';
import { MyPosition, ProtocolData } from '../hooks/useProtocol';

type Props = { data: ProtocolData; withdrawDelay: number; onDone: () => void };

export function PositionsPanel({ data, withdrawDelay, onDone }: Props) {
    if (data.myPositions.length === 0) {
        return (
            <section className="card panel">
                <h3>Мои позиции</h3>
                <p className="muted">Пока пусто. Выберите транш выше и внесите депозит.</p>
            </section>
        );
    }

    return (
        <section className="card panel">
            <h3>Мои позиции</h3>
            <div className="positions">
                {data.myPositions.map((p) => (
                    <PositionRow key={p.trancheId} pos={p} withdrawDelay={withdrawDelay} onDone={onDone} />
                ))}
            </div>
        </section>
    );
}

function PositionRow({
    pos,
    withdrawDelay,
    onDone,
}: {
    pos: MyPosition;
    withdrawDelay: number;
    onDone: () => void;
}) {
    const [tonConnectUI] = useTonConnectUI();
    const [busy, setBusy] = useState(false);
    const meta = TRANCHES[pos.trancheId];

    const now = Math.floor(Date.now() / 1000);
    const matured = pos.lockedShares > 0n && now >= pos.unlockAt;
    const waiting = pos.lockedShares > 0n && !matured;

    async function send(payload: string, ton: bigint) {
        setBusy(true);
        try {
            await tonConnectUI.sendTransaction({
                validUntil: Math.floor(Date.now() / 1000) + 300,
                messages: [{ address: pos.address.toString(), amount: ton.toString(), payload }],
            });
            setTimeout(onDone, 6000);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className={`position position--${pos.trancheId}`}>
            <div className="position__main">
                <span className={`pill pill--${pos.trancheId}`}>{meta.name}</span>
                <div>
                    <div className="num position__value">{fmtAmount(pos.valueNow)}</div>
                    <div className="muted small">{fmtAmount(pos.shares + pos.lockedShares)} долей</div>
                </div>
            </div>

            {waiting && (
                <p className="muted small">
                    {fmtAmount(pos.lockedShares)} долей заявлено к выходу. Забрать можно через{' '}
                    {fmtDuration(pos.unlockAt - now)}.
                </p>
            )}

            <div className="position__actions">
                {pos.shares > 0n && (
                    <button
                        className="btn btn--ghost"
                        disabled={busy}
                        onClick={() =>
                            send(withdrawRequestMessage(pos.shares).toBoc().toString('base64'), WITHDRAW_REQUEST_TON)
                        }
                    >
                        Заявить выход
                    </button>
                )}
                {matured && (
                    <button
                        className="btn btn--primary"
                        disabled={busy}
                        onClick={() => send(withdrawClaimMessage().toBoc().toString('base64'), WITHDRAW_CLAIM_TON)}
                    >
                        Забрать
                    </button>
                )}
            </div>

            {pos.shares > 0n && pos.lockedShares === 0n && (
                <p className="muted small">
                    Выход занимает {fmtDuration(withdrawDelay)}. Цена доли считается на момент получения,
                    а не заявки: убыток за это время ляжет и на вас.
                </p>
            )}
        </div>
    );
}
