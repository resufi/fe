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
    const w = data.wallet;

    // Пока баланс не прочитан, «превышает баланс» сказать нельзя: мы просто
    // не знаем. Раньше в этот момент показывался ноль, и кнопка запрещала
    // депозит человеку, у которого деньги есть.
    const problem = !wallet
        ? 'Connect a wallet'
        : !w
          ? 'Loading balance…'
          : raw && amount === null
            ? 'Invalid amount'
            : amount !== null && amount < MIN_DEPOSIT
              ? 'Minimum is 1'
              : amount !== null && amount > w.balance
                ? 'Exceeds your balance'
                : null;

    async function send() {
        if (!wallet || amount === null || !w) return;
        setBusy(true);
        setNote(null);
        try {
            const body = depositMessage(addr.vault(), Address.parse(wallet), trancheId, amount);
            await tonConnectUI.sendTransaction({
                validUntil: Math.floor(Date.now() / 1000) + 300,
                messages: [
                    {
                        address: w.jettonWallet.toString(),
                        amount: DEPOSIT_TOTAL_TON.toString(),
                        payload: body.toBoc().toString('base64'),
                    },
                ],
            });
            setRaw('');
            setNote('Sent. Shares appear once the transaction reaches the contract — usually a few seconds.');
            setTimeout(onDone, 6000);
        } catch (e) {
            setNote(e instanceof Error ? e.message : 'Transaction rejected');
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="panel">
            <header className="panel__head">
                <h2 className="section-title">Deposit into {meta.name}</h2>
                <button
                    type="button"
                    className="linkish num"
                    onClick={() => w && setRaw(fmtAmount(w.balance, 9).replace(/[\s,]/g, ''))}
                    disabled={!w || w.balance === 0n}
                >
                    {w ? fmtAmount(w.balance) : '…'}
                </button>
            </header>

            <input
                className="input num"
                inputMode="decimal"
                placeholder="0"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                aria-label="Deposit amount"
            />

            <button className="btn" onClick={send} disabled={busy || !!problem || amount === null}>
                {busy ? 'Sending…' : (problem ?? 'Deposit')}
            </button>

            {note && <p className="note">{note}</p>}

            {/* Про газ пишем мелко и только суммой: подробности нужны тому, кто
                спросит, а не всем подряд. */}
            <p className="muted small">
                +{fmtAmount(DEPOSIT_TOTAL_TON)} GRAM for gas, excess is refunded
            </p>
        </section>
    );
}
