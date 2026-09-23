import { useEffect, useRef, useState } from "react";
import { useTonAddress } from "@tonconnect/ui-react";

import { TRANCHES } from "./lib/config.ts";
import { fmtAmount, fmtBps, fmtDuration, shortAddress } from "./lib/format.ts";
import { useProtocol } from "./hooks/useProtocol.ts";
import { hasApiKey } from "./lib/chain.ts";
import { Waterfall } from "./components/Waterfall/Waterfall.tsx";
import { DepositPanel } from "./components/DepositPanel/DepositPanel.tsx";
import { PositionsPanel } from "./components/PositionsPanel/PositionsPanel.tsx";
import { Logo } from "./components/Logo/Logo.tsx";
import { ChainNotReady } from "./components/ChainNotReady/ChainNotReady.tsx";
import { NetworkControls } from "./components/NetworkControls/NetworkControls.tsx";
import { PoolControls } from "./components/PoolControls/PoolControls.tsx";
import { SolanaPanel } from "./components/SolanaPanel/SolanaPanel.tsx";
import { useSolanaWallet } from "./hooks/useSolanaWallet.ts";
import { useEvmWallet } from "./hooks/useEvmWallet.ts";
import { EvmPanel } from "./components/EvmPanel/EvmPanel.tsx";
import { CHAINS, saveChain, type ChainId } from "./lib/chains.ts";
import { evmChain, EVM_CHAINS } from "./lib/evm.ts";
import { loadPool, poolsOfChain, savePool, type Pool } from "./lib/pools.ts";
import { Loader } from "./components/Loader/Loader.tsx";
import { HeroSkeleton } from "./components/HeroSkeleton/HeroSkeleton.tsx";
import css from "./App.module.css";

const LOADER_MIN_MS = 3800;

export default function App() {
	const [pool, setPoolState] = useState<Pool>(loadPool);
	const solana = useSolanaWallet();
	// Кошелёк EVM целится в сеть активного пула; для не-EVM пула берём
	// любую EVM-сеть как заглушку — он там всё равно не используется.
	const evm = useEvmWallet(EVM_CHAINS[pool.chain] ?? evmChain("hyperevm"));
	const { data, error, loading, refresh, network } = useProtocol(
		pool,
		pool.chain === "solana" ? solana.address : null,
		pool.chain in EVM_CHAINS ? evm.address : null,
	);
	const wallet = useTonAddress();
	const [selected, setSelected] = useState(0);
	const chain = pool.chain;

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

	// Один и тот же выбор в двух местах: в шапке водопада, когда данные есть,
	// и над сообщением, когда их нет. Уйти с неразвёрнутого пула надо именно
	// оттуда, где водопада не существует.
	const controls = (
		<PoolControls
			chain={chain}
			onChainChange={switchChain}
			pools={poolsOfChain(chain)}
			pool={pool}
			onPoolChange={switchPool}
		/>
	);

	const booted = useRef(false);
	useEffect(() => {
		if (data) booted.current = true;
	}, [data]);

	const [minShown, setMinShown] = useState(false);
	useEffect(() => {
		const t = setTimeout(() => setMinShown(true), LOADER_MIN_MS);
		return () => clearTimeout(t);
	}, []);

	if (!booted.current && (!minShown || (pool.deployed && !data && !error))) {
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
				<NetworkControls chain={chain} solana={solana} evm={evm} />
			</header>

			<h1 className={css.lede} data-lede>
				Staking where you pick
				<br />
				your place in the loss queue.
			</h1>

			{!CHAINS[chain].deployed ? (
				<div className={css.stateBlock}>
					{controls}
					<ChainNotReady chain={chain} />
				</div>
			) : !pool.deployed ? (
				<div className={css.stateBlock}>
					{controls}
					<NotDeployed pool={pool} />
				</div>
			) : !data ? (
				<div className={css.stateBlock}>
					{/*
					 * Блоки живые во всех состояниях. Смена пула сбрасывает
					 * data в null, и экран уходит сюда при каждом переключении —
					 * если подменять блоки скелетом, они исчезают прямо под
					 * курсором. Ждать им нечего: списки сетей и пулов
					 * статические.
					 */}
					{controls}
					{error ? (
						<p className={css.state}>
							{error}{" "}
							<button className={css.linkish} onClick={() => void refresh()}>
								Retry
							</button>
						</p>
					) : (
						<HeroSkeleton />
					)}
				</div>
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
							asset={pool.kind === "coupon" ? pool.unit : pool.asset}
							decimals={pool.decimals}
							kind={pool.kind}
							controls={controls}
							selected={selected}
							onSelect={setSelected}
						/>

						<div className={css.side}>
							{chain in EVM_CHAINS ? (
								evm.address ? (
									<EvmPanel
										data={data}
										trancheId={selected}
										pool={pool}
										wallet={evm}
										onDone={() => void refresh()}
									/>
								) : (
									<p className="muted state">
										Connect an EVM wallet to deposit. Pool state above is live
										on-chain.
									</p>
								)
							) : chain === "solana" ? (
								solana.address ? (
									<SolanaPanel
										data={data}
										trancheId={selected}
										asset={pool.asset}
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
					<dt>Shield fee</dt>
					<dd className="num">{fmtBps(m.seniorFeeBps)}</dd>
				</div>
				<div>
					<dt>Total deposited</dt>
					<dd className="num">
							{fmtAmount(vault.principalDeposited, 2, BigInt(pool.decimals))}
						</dd>
				</div>
				<div>
					<dt>Losses applied</dt>
					<dd className="num">
							{fmtAmount(vault.cumulativeLoss, 2, BigInt(pool.decimals))}
						</dd>
				</div>
			</dl>

			<p className="muted small">
				The mandate is immutable: different rules mean a different vault, not an
				edit.
			</p>

			<ul className={css.addrs}>
				<li>
					Vault <code>{shortAddress(pool.vault ?? "—")}</code>
				</li>
				{/* Registry есть не у всех сетей: на HyperEVM убыток не
				    объявляется, а наблюдается, и объявлять его некому. */}
				{pool.registry && (
					<li>
						Registry <code>{shortAddress(pool.registry)}</code>
					</li>
				)}
				<li>
					Asset ({pool.asset}) <code>{shortAddress(pool.jettonMaster ?? "—")}</code>
				</li>
				{/* Адреса токенов долей: кошельки не находят их сами, и без
				    этих строк человек не увидит свою позицию у себя. */}
				{pool.trancheMasters.map((addr, i) => (
					<li key={addr}>
						{TRANCHES[i].name} shares <code>{shortAddress(addr)}</code>
					</li>
				))}
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
				yet. Switch pools above to use one that is live.
			</p>
			<pre className={css.code}>
				<code>npx blueprint run deployAll --{pool.network}</code>
			</pre>
		</section>
	);
}
