import { useState } from "react";
import { useTonAddress } from "@tonconnect/ui-react";

import { TRANCHES } from "./lib/config.ts";
import { fmtAmount, fmtBps, fmtDuration, shortAddress } from "./lib/format.ts";
import { explorerAddressUrl } from "./lib/explorer.ts";
import { useProtocol } from "./hooks/useProtocol.ts";
import { hasApiKey } from "./lib/chain.ts";
import { Waterfall } from "./components/Waterfall/Waterfall.tsx";
import { DepositPanel } from "./components/DepositPanel/DepositPanel.tsx";
import { PositionsPanel } from "./components/PositionsPanel/PositionsPanel.tsx";
import { Logo } from "./components/Logo/Logo.tsx";
import { ChainNotReady } from "./components/ChainNotReady/ChainNotReady.tsx";
import { NetworkControls } from "./components/NetworkControls/NetworkControls.tsx";
import { ThemeToggle } from "./components/ThemeToggle/ThemeToggle.tsx";
import { PoolControls } from "./components/PoolControls/PoolControls.tsx";
import { SolanaPanel } from "./components/SolanaPanel/SolanaPanel.tsx";
import { useSolanaWallet } from "./hooks/useSolanaWallet.ts";
import { useEvmWallet } from "./hooks/useEvmWallet.ts";
import { EvmPanel } from "./components/EvmPanel/EvmPanel.tsx";
import { BasketsPanel } from "./components/BasketsPanel/BasketsPanel.tsx";
import { IndexPanel } from "./components/IndexPanel/IndexPanel.tsx";
import { Tabs } from "./components/Tabs/Tabs.tsx";
import { chainHasBaskets } from "./lib/baskets.ts";
import { chainHasIndexes } from "./lib/indexes.ts";
import type { EvmWallet } from "./hooks/useEvmWallet.ts";
import type { ProtocolData } from "./hooks/useProtocol.ts";
import { PointsPanel } from "./components/PointsPanel/PointsPanel.tsx";
import { Onboarding } from "./components/Onboarding/Onboarding.tsx";
import { CHAINS, saveChain, type ChainId } from "./lib/chains.ts";
import { evmChain, EVM_CHAINS } from "./lib/evm.ts";
import { loadPool, poolsOfChain, savePool, type Pool } from "./lib/pools.ts";
import { Loader } from "./components/Loader/Loader.tsx";
import { HeroSkeleton } from "./components/HeroSkeleton/HeroSkeleton.tsx";
import css from "./App.module.css";

export default function App() {
	const [pool, setPoolState] = useState<Pool>(loadPool);
	const solana = useSolanaWallet();

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

	function switchChain(id: ChainId) {
		const next = poolsOfChain(id)[0];
		if (next) switchPool(next);
	}

	const controls = (
		<PoolControls
			chain={chain}
			onChainChange={switchChain}
			pools={poolsOfChain(chain)}
			pool={pool}
			onPoolChange={switchPool}
		/>
	);

	const [intro, setIntro] = useState(true);
	const ready = Boolean(data) || Boolean(error) || !pool.deployed;

	return (
		<div className={css.page}>
			{intro && <Loader ready={ready} onDone={() => setIntro(false)} />}

			<header className={css.topbar}>
				<span className={css.brand}>
					<Logo />
					Resu
					{network === "testnet" && <span className={css.chip}>testnet</span>}
				</span>
				<span className={css.actions}>
					<ThemeToggle />
					<NetworkControls chain={chain} solana={solana} evm={evm} />
				</span>
			</header>

			<h1 className={css.lede} data-lede>
				Choose your risk on any asset -
				<br />
				from protected to high-upside.
			</h1>

			<p className={css.subhead}>
				Built first for tokenized real-world assets — and just as at home with
				ETH, staking tokens and yield-bearing stablecoins. One deposit, your
				choice of risk.
			</p>

			<Onboarding />

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

					{(error || (chain === "ton" && !hasApiKey)) && (
						<p className={`${css.state} small`}>
							{error
								? "Data may be stale."
								: "Public node is rate-limited, so reads are slow. A toncenter API key removes the limit."}{" "}
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
								<EvmActions
									chain={chain}
									data={data}
									selected={selected}
									pool={pool}
									evm={evm}
									onDone={() => void refresh()}
								/>
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

					<PointsPanel
						address={chain === "solana" ? solana.address : evm.address}
					/>

					<Details vault={data.vault} pool={pool} loading={loading} />
				</>
			)}
		</div>
	);
}

function EvmActions({
	chain,
	data,
	selected,
	pool,
	evm,
	onDone,
}: {
	chain: ChainId;
	data: ProtocolData;
	selected: number;
	pool: Pool;
	evm: EvmWallet;
	onDone: () => void;
}) {
	const tier = evm.address ? (
		<EvmPanel
			data={data}
			trancheId={selected}
			pool={pool}
			wallet={evm}
			onDone={onDone}
		/>
	) : (
		<p className="muted state">
			Connect an EVM wallet to deposit. Pool state above is live on-chain.
		</p>
	);

	const tabs = [
		...(chainHasBaskets(chain)
			? [
					{
						id: "oneclick",
						label: "One-click",
						content: <BasketsPanel chain={chain} wallet={evm} />,
					},
				]
			: []),
		...(chainHasIndexes(chain)
			? [
					{
						id: "index",
						label: "Index",
						content: <IndexPanel chain={chain} wallet={evm} />,
					},
				]
			: []),
		{ id: "tier", label: "Single tier", content: tier },
	];

	if (tabs.length === 1) return tier;
	return <Tabs tabs={tabs} />;
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
					<dt>Protected fee</dt>
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
					Vault <Addr pool={pool} addr={pool.vault} />
				</li>

				{pool.registry && (
					<li>
						Registry <Addr pool={pool} addr={pool.registry} />
					</li>
				)}
				<li>
					Asset ({pool.asset}) <Addr pool={pool} addr={pool.jettonMaster} />
				</li>

				{pool.trancheMasters.map((addr, i) => (
					<li key={addr}>
						{TRANCHES[i].tech} shares <Addr pool={pool} addr={addr} />
					</li>
				))}
			</ul>
		</details>
	);
}

function Addr({ pool, addr }: { pool: Pool; addr: string | null }) {
	if (!addr) return <code>—</code>;
	return (
		<a
			className={css.addrLink}
			href={explorerAddressUrl(pool, addr)}
			target="_blank"
			rel="noreferrer"
			title={addr}
		>
			<code>{shortAddress(addr)}</code>
		</a>
	);
}

function NotDeployed({ pool }: { pool: Pool }) {
	return (
		<section>
			<h2 className={css.title}>{pool.label} is not live yet</h2>
			<p className="muted small">
				The contracts are ready and this pool is next in line. Pick another pool
				above to deposit today.
			</p>
		</section>
	);
}
