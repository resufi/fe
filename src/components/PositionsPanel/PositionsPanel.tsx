import { useState } from "react";
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react";
import { Address } from "@ton/core";
import { hueStyle, TRANCHES } from "../../lib/config.ts";
import { fmtAmount, fmtDuration, toGram } from "../../lib/format.ts";
import { burnMessage, claimMessage, BURN_TON, CLAIM_TON } from "../../lib/payloads.ts";
import { MyPosition, ProtocolData } from "../../hooks/useProtocol.ts";
import css from "./PositionsPanel.module.css";

type Props = {
	data: ProtocolData;
	withdrawDelay: number;
	/** Base asset and coin tickers: per-chain. */
	asset: string;
	unit: string;
	/** Base asset decimals: nine for tsTON, six for tsUSDe. */
	decimals: number;
	onDone: () => void;
};

export function PositionsPanel({
	data,
	withdrawDelay,
	asset,
	unit,
	decimals,
	onDone,
}: Props) {
	// An empty "no positions" block is noise. We simply show nothing.
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
						decimals={decimals}
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
	decimals,
	withdrawDelay,
	onDone,
}: {
	pos: MyPosition;
	rate: number | null;
	asset: string;
	unit: string;
	decimals: number;
	withdrawDelay: number;
	onDone: () => void;
}) {
	const [tonConnectUI] = useTonConnectUI();
	const wallet = useTonAddress();
	const [busy, setBusy] = useState(false);
	const meta = TRANCHES[pos.trancheId];

	// Only TON positions have addresses; on Solana they're derived when building
	// the transaction, and these buttons aren't shown there.
	const { shareWallet, ticket } = pos;
	const now = Math.floor(Date.now() / 1000);
	const matured = pos.pendingShares > 0n && now >= pos.unlockAt;
	const waiting = pos.pendingShares > 0n && !matured;

	// The recipient depends on the action: a burn goes to the tranche jetton wallet,
	// claiming funds goes to the ticket contract. These are different contracts.
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
					{/* GRAM as the first number on purpose. Accounting is in tsTON, and
                        tsTON's own appreciation doesn't enter our figures: senior
                        would see a shrinking balance and read it as a loss,
                        though in GRAM they're up. */}
					<div className={`${css.value} num`}>
						{rate === null
							? fmtAmount(pos.valueNow, 2, BigInt(decimals))
							: fmtAmount(toGram(pos.valueNow, rate))}
						<span className="muted"> {rate === null ? asset : unit}</span>
					</div>
					<div className="muted small num">
						{rate === null ? null : <>{fmtAmount(pos.valueNow, 4, BigInt(decimals))} {asset} · </>}
						{fmtAmount(pos.shares + pos.pendingShares, 4, BigInt(decimals))} shares
					</div>
				</div>
			</div>

			{waiting && (
				<p className={css.hint}>
					{fmtAmount(pos.pendingShares, 4, BigInt(decimals))} exiting · available in{" "}
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
