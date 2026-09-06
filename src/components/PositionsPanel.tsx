import { useState } from "react";
import { useTonConnectUI } from "@tonconnect/ui-react";
import { hueStyle, TRANCHES } from "../lib/config";
import { fmtAmount, fmtDuration, toGram } from "../lib/format";
import {
	withdrawClaimMessage,
	withdrawRequestMessage,
	WITHDRAW_CLAIM_TON,
	WITHDRAW_REQUEST_TON,
} from "../lib/payloads";
import { MyPosition, ProtocolData } from "../hooks/useProtocol";
import css from "./PositionsPanel.module.css";

type Props = { data: ProtocolData; withdrawDelay: number; onDone: () => void };

export function PositionsPanel({ data, withdrawDelay, onDone }: Props) {
	if (!data.wallet || data.wallet.positions.length === 0) {
		return null;
	}

	return (
		<section className={css.panel}>
			<h2 className={css.title}>Your positions</h2>
			<div className={css.list}>
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
				messages: [
					{ address: pos.address.toString(), amount: ton.toString(), payload },
				],
			});
			setTimeout(onDone, 6000);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className={css.position} style={hueStyle(pos.trancheId)}>
			<div className={css.main}>
				<span className="muted small">{meta.name}</span>
				<div className={css.figures}>
					{/* GRAM первым числом намеренно. Учёт ведётся в tsTON, и
                        рост самого tsTON в наши цифры не попадает: senior
                        видел бы уменьшающийся остаток и читал его как убыток,
                        хотя в GRAM он в плюсе. */}
					<div className={`${css.value} num`}>
						{rate === null
							? fmtAmount(pos.valueNow)
							: fmtAmount(toGram(pos.valueNow, rate))}
						<span className="muted"> {rate === null ? "tsTON" : "GRAM"}</span>
					</div>
					<div className="muted small num">
						{rate === null ? null : <>{fmtAmount(pos.valueNow, 4)} tsTON · </>}
						{fmtAmount(pos.shares + pos.lockedShares, 4)} shares
					</div>
				</div>
			</div>

			{waiting && (
				<p className={css.hint}>
					Available in {fmtDuration(pos.unlockAt - now)}
				</p>
			)}

			<div className={css.actions}>
				{pos.shares > 0n && (
					<button
						className={`${css.btn} ${css.ghost}`}
						disabled={busy}
						onClick={() =>
							send(
								withdrawRequestMessage(pos.shares).toBoc().toString("base64"),
								WITHDRAW_REQUEST_TON,
							)
						}
					>
						Withdraw
					</button>
				)}
				{matured && (
					<button
						className={css.btn}
						disabled={busy}
						onClick={() =>
							send(
								withdrawClaimMessage().toBoc().toString("base64"),
								WITHDRAW_CLAIM_TON,
							)
						}
					>
						Claim
					</button>
				)}
			</div>

			{pos.shares > 0n && pos.lockedShares === 0n && (
				<p className={css.hint}>
					Withdrawal takes {fmtDuration(withdrawDelay)}
				</p>
			)}
		</div>
	);
}
