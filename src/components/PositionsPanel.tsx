import { useState } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import { Address } from "@ton/core";
import { hueStyle, TRANCHES } from "../lib/config.ts";
import { fmtAmount, fmtDuration, toGram } from "../lib/format.ts";
import { burnMessage, claimMessage, BURN_TON, CLAIM_TON } from "../lib/payloads.ts";
import { MyPosition, ProtocolData } from "../hooks/useProtocol.ts";
import css from "./PositionsPanel.module.css";

type Props = {
	data: ProtocolData;
	withdrawDelay: number;
	/** Тикеры базового актива и монеты: у каждой сети свои. */
	asset: string;
	unit: string;
	onDone: () => void;
};

export function PositionsPanel({ data, withdrawDelay, asset, unit, onDone }: Props) {
	// Пустой блок «позиций нет» — это шум. Просто не показываем ничего.
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
						asset={asset}
						unit={unit}
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
	asset,
	unit,
	withdrawDelay,
	onDone,
}: {
	pos: MyPosition;
	rate: number | null;
	asset: string;
	unit: string;
	withdrawDelay: number;
	onDone: () => void;
}) {
	const [tonConnectUI] = useTonConnectUI();
	const wallet = useTonAddress();
	const [busy, setBusy] = useState(false);
	const meta = TRANCHES[pos.trancheId];

	// Адреса есть только у TON-позиций; на Solana они выводятся при сборке
	// транзакции, и эти кнопки там не показываются.
	const { shareWallet, ticket } = pos;
	const now = Math.floor(Date.now() / 1000);
	const matured = pos.pendingShares > 0n && now >= pos.unlockAt;
	const waiting = pos.pendingShares > 0n && !matured;

	// Адресат зависит от действия: сжигание идёт в кошелёк жетона транша,
	// получение денег — в контракт заявки. Это разные контракты.
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
						<span className="muted"> {rate === null ? asset : unit}</span>
					</div>
					<div className="muted small num">
						{rate === null ? null : <>{fmtAmount(pos.valueNow, 4)} {asset} · </>}
						{fmtAmount(pos.shares + pos.pendingShares, 4)} shares
					</div>
				</div>
			</div>

			{waiting && (
				<p className={css.hint}>
					{fmtAmount(pos.pendingShares, 4)} exiting · available in{" "}
					{fmtDuration(pos.unlockAt - now)}
				</p>
			)}

			<div className={css.actions}>
				{pos.shares > 0n && wallet && shareWallet && (
					<button
						className={`${css.btn} ${css.ghost}`}
						disabled={busy}
						onClick={() =>
							send(
								shareWallet,
								burnMessage(pos.shares, Address.parse(wallet))
									.toBoc()
									.toString("base64"),
								BURN_TON,
							)
						}
					>
						Withdraw
					</button>
				)}
				{matured && ticket && (
					<button
						className={css.btn}
						disabled={busy}
						onClick={() =>
							send(
								ticket,
								claimMessage().toBoc().toString("base64"),
								CLAIM_TON,
							)
						}
					>
						Claim
					</button>
				)}
			</div>

			{pos.shares > 0n && pos.pendingShares === 0n && (
				<p className={css.hint}>
					Shares are transferable · withdrawal takes{" "}
					{fmtDuration(withdrawDelay)}
				</p>
			)}
		</div>
	);
}
