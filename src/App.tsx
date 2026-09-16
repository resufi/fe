import { useState } from "react";
import { TonConnectButton, useTonAddress } from "@tonconnect/ui-react";
import { fmtAmount, fmtBps, fmtDuration, shortAddress } from "./lib/format.ts";
import { useProtocol } from "./hooks/useProtocol.ts";
import { hasApiKey } from "./lib/chain.ts";
import { Waterfall } from "./components/Waterfall.tsx";
import { DepositPanel } from "./components/DepositPanel.tsx";
import { PositionsPanel } from "./components/PositionsPanel.tsx";
import { Logo } from "./components/Logo.tsx";
import { ChainSwitch } from "./components/ChainSwitch.tsx";
import { ChainNotReady } from "./components/ChainNotReady.tsx";
import { SolanaConnect } from "./components/SolanaConnect.tsx";
import { SolanaPanel } from "./components/SolanaPanel.tsx";
import { useSolanaWallet } from "./hooks/useSolanaWallet.ts";
import { CHAINS, saveChain, type ChainId } from "./lib/chains.ts";
import { loadPool, poolsOfChain, savePool, type Pool } from "./lib/pools.ts";
import { PoolSwitch } from "./components/PoolSwitch.tsx";
import { Loader } from "./components/Loader.tsx";
import css from "./App.module.css";

export default function App() {
	const [pool, setPoolState] = useState<Pool>(loadPool);
	const solana = useSolanaWallet();
	const { data, error, loading, refresh, network } = useProtocol(
		pool,
		pool.chain === "solana" ? solana.address : null,
	);
	const wallet = useTonAddress();
	const [selected, setSelected] = useState(0);
	const chain = pool.chain;
	const siblings = poolsOfChain(chain);

	function switchPool(p: Pool) {
		setPoolState(p);
		savePool(p.id);
		saveChain(p.chain);
	}

	// Смена сети выбирает её первый пул: адреса, разрядность и мандат у сетей
	// свои, и держать выбор прошлой сети было бы просто неверно.
	function switchChain(id: ChainId) {
		const next = poolsOfChain(id)[0];
		if (next) switchPool(next);
	}

	if (pool.deployed && !data && !error) {
		return <Loader />;
	}

	return (
		<div className={css.page}>
			<header className={css.topbar}>
				<span className={css.brand}>
					<Logo />
					Resu
					{network === "testnet" && <span className={css.chip}>testnet</span>}
				</span>
				<span className={css.topbarRight}>
					<ChainSwitch value={chain} onChange={switchChain} />
					<PoolSwitch pools={siblings} value={pool} onChange={switchPool} />
					{/* Кнопка кошелька своя у каждой сети. Пока живёт только TON,
					    в остальных подключать нечего. */}
					{chain === "ton" ? (
						<TonConnectButton />
					) : (
						<SolanaConnect wallet={solana} />
					)}
				</span>
			</header>

			<h1 className={css.lede} data-lede>
				Staking where you pick
				<br />
				your place in the loss queue.
			</h1>

			{!CHAINS[chain].deployed ? (
				<ChainNotReady chain={chain} />
			) : !pool.deployed ? (
				<NotDeployed pool={pool} />
			) : !data ? (
				<p className={css.state}>
					{error}{" "}
					<button className={css.linkish} onClick={() => void refresh()}>
						Retry
					</button>
				</p>
			) : (
				<>
					{(error || !hasApiKey) && (
						<p className={`${css.state} small`}>
							{error
								? "Data may be stale."
								: "Public node is rate-limited, so reads are slow."}
							{!hasApiKey && " A toncenter API key removes the limit."}{" "}
							<button className={css.linkish} onClick={() => void refresh()}>
								Refresh
							</button>
						</p>
					)}

					<div className={css.hero}>
						<Waterfall
							tranches={data.tranches}
							headroom={data.headroom}
							mandate={pool.mandate}
							rate={data.rate}
							asset={pool.asset}
							decimals={pool.decimals}
							selected={selected}
							onSelect={setSelected}
						/>

						<div className={css.side}>
							{chain === "solana" ? (
								solana.address ? (
									<SolanaPanel
										data={data}
										trancheId={selected}
										asset={CHAINS[chain].asset}
										wallet={solana}
										onDone={() => void refresh()}
									/>
								) : (
									<p className="muted state">
										Connect a Solana wallet to deposit. Pool state above is live
										from {network}.
									</p>
								)
							) : wallet ? (
								<>
									<DepositPanel
										data={data}
										trancheId={selected}
										pool={pool}
										onDone={() => void refresh()}
									/>
									<PositionsPanel
										data={data}
										withdrawDelay={data.vault.withdrawDelay}
										asset={pool.asset}
										unit={pool.unit}
										decimals={pool.decimals}
										onDone={() => void refresh()}
									/>
								</>
							) : (
								<p className={css.state}>
									Pick a tranche, then connect a wallet to deposit.
								</p>
							)}
						</div>
					</div>

					<Details vault={data.vault} pool={pool} loading={loading} />
				</>
			)}
		</div>
	);
}

function Details({
	vault,
	pool,
	loading,
}: {
	pool: Pool;
	vault: {
		maxLossBps: number;
		withdrawDelay: number;
		principalDeposited: bigint;
		cumulativeLoss: bigint;
	};
	loading: boolean;
}) {
	const m = pool.mandate;
	return (
		<details className={css.details}>
			<summary>Rules and addresses{loading ? " · refreshing" : ""}</summary>

			<dl className={css.facts}>
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
				The mandate is immutable: different rules mean a different vault, not an
				edit.
			</p>

			<ul className={css.addrs}>
				<li>
					Vault <code>{shortAddress(pool.vault!)}</code>
				</li>
				<li>
					Registry <code>{shortAddress(pool.registry!)}</code>
				</li>
				<li>
					Asset ({pool.asset}) <code>{shortAddress(pool.jettonMaster!)}</code>
				</li>
			</ul>
		</details>
	);
}

function NotDeployed({ pool }: { pool: Pool }) {
	return (
		<section>
			<h2 className={css.title}>{pool.label} pool is not deployed yet</h2>
			<p className="muted small">
				The contracts are ready; this pool has no addresses on {pool.network}{" "}
				yet. The {pool.asset === "tsTON" ? "other" : "tsTON"} pool is live —
				switch above.
			</p>
			<pre className={css.code}>
				<code>npx blueprint run deployAll --{pool.network}</code>
			</pre>
		</section>
	);
}
