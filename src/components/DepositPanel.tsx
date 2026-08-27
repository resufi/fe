import { useState } from 'react';
import { Address } from '@ton/core';
import { useTonConnectUI, useTonAddress } from '@tonconnect/ui-react';
import { addr, TRANCHES } from '../lib/config';
import { fmtAmount, parseAmount } from '../lib/format';
import { depositMessage, DEPOSIT_TOTAL_TON } from '../lib/payloads';
import { ProtocolData } from '../hooks/useProtocol';

type Props = {
    data: ProtocolData;
    trancheId: number;
    onDone: () => void;
};

const MIN_DEPOSIT = 1_000_000_000n; // 1 единица — тот же минимум, что в контракте

export function DepositPanel({ data, trancheId, onDone }: Props) {
    const [tonConnectUI] = useTonConnectUI();
    const wallet = useTonAddress();
    const [raw, setRaw] = useState('');
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<string | null>(null);

    const amount = parseAmount(raw);
    const meta = TRANCHES[trancheId];

    const problem = !wallet
        ? 'Подключите кошелёк'
        : raw && amount === null
          ? 'Некорректная сумма'
          : amount !== null && amount < MIN_DEPOSIT
            ? 'Минимум 1 единица'
            : amount !== null && amount > data.myBalance
              ? 'Больше, чем есть на балансе'
              : null;

    async function send() {
        if (!wallet || amount === null || !data.myJettonWallet) return;
        setBusy(true);
        setNote(null);
        try {
            const body = depositMessage(addr.vault(), Address.parse(wallet), trancheId, amount);
            await tonConnectUI.sendTransaction({
                validUntil: Math.floor(Date.now() / 1000) + 300,
                messages: [
                    {
                        address: data.myJettonWallet.toString(),
                        amount: DEPOSIT_TOTAL_TON.toString(),
                        payload: body.toBoc().toString('base64'),
                    },
                ],
            });
            setRaw('');
            setNote('Отправлено. Доли появятся, когда транзакция дойдёт до контракта — обычно несколько секунд.');
            setTimeout(onDone, 6000);
        } catch (e) {
            setNote(e instanceof Error ? e.message : 'Транзакция отклонена');
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="card panel">
            <header className="panel__head">
                <h3>Внести в {meta.name}</h3>
                <span className="muted">
                    Доступно: <b className="num">{fmtAmount(data.myBalance)}</b>
                </span>
            </header>

            <div className="field">
                <input
                    className="input num"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    aria-label="Сумма депозита"
                />
                <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setRaw(fmtAmount(data.myBalance, 9).replace(/\s/g, ''))}
                    disabled={data.myBalance === 0n}
                >
                    Всё
                </button>
            </div>

            <button className="btn btn--primary" onClick={send} disabled={busy || !!problem || amount === null}>
                {busy ? 'Отправляю…' : problem ?? `Внести в ${meta.name}`}
            </button>

            {note && <p className="note">{note}</p>}

            <p className="muted small">
                К переводу прикладывается {fmtAmount(DEPOSIT_TOTAL_TON)} GRAM на газ. Это требование
                стандарта жетонов: без оплаченного уведомления контракт не узнает о переводе.
                Излишек вернётся на ваш кошелёк.
            </p>
        </section>
    );
}
