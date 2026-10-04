import { useCallback, useEffect, useMemo, useState } from "react";
import type { EvmChainParams } from "../lib/evm.ts";
import {
	discover,
	legacyProvider,
	SUGGESTED,
	type DiscoveredWallet,
	type Eip1193,
} from "../lib/evmWallets.ts";
import { connectEvmWalletConnect, projectId } from "../lib/evmWalletConnect.ts";

const REMEMBER_KEY = "resu:evm-wallet";

export type EvmEntry = {
	id: string;
	name: string;
	icon: string;
	installed: boolean;
	/** Where to go if not installed. */
	url?: string;
};

export type EvmWallet = {
	address: string | null;
	chainId: number | null;
	/** Connected, but the wrong network: transfers aren't allowed. */
	wrongChain: boolean;
	entries: EvmEntry[];
	connecting: string | null;
	remembered: string | null;
	error: string | null;
	connect: (id: string) => Promise<void>;
	disconnect: () => Promise<void>;
	switchChain: () => Promise<void>;
	/** The target network name — for the "Switch to …" button. */
	chainName: string;
	send: (to: string, data: string) => Promise<string>;
};

const WC = "walletconnect";

export function useEvmWallet(target: EvmChainParams): EvmWallet {
	const [found, setFound] = useState<DiscoveredWallet[]>([]);
	const [active, setActive] = useState<{ id: string; provider: Eip1193 } | null>(null);
	const [wcDisconnect, setWcDisconnect] = useState<(() => Promise<void>) | null>(null);
	const [address, setAddress] = useState<string | null>(null);
	const [chainId, setChainId] = useState<number | null>(null);
	const [connecting, setConnecting] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const remembered =
		typeof localStorage === "undefined" ? null : localStorage.getItem(REMEMBER_KEY);

	// Wallets announce themselves via events, so the subscription is set up once
	// on mount: one installed later will still get a chance to respond.
	useEffect(() => {
		return discover((w) =>
			setFound((prev) => (prev.some((p) => p.id === w.id) ? prev : [...prev, w])),
		);
	}, []);

	/**
	 * The list to display.
	 *
	 * First what is actually installed — with native icons.
	 * Then WalletConnect, then install suggestions. A wallet that found
	 * itself is removed from the suggestions: the same row twice is confusing.
	 */
	const entries = useMemo<EvmEntry[]>(() => {
		const installed = found.length > 0 ? found : ([legacyProvider()].filter(Boolean) as DiscoveredWallet[]);
		const list: EvmEntry[] = installed.map((w) => ({
			id: w.id,
			name: w.name,
			icon: w.icon,
			installed: true,
		}));

		if (projectId()) {
			list.push({ id: WC, name: "WalletConnect", icon: "", installed: true });
		}

		for (const s of SUGGESTED) {
			if (installed.some((w) => w.id === s.id || w.name === s.name)) continue;
			list.push({ id: s.id, name: s.name, icon: "", installed: false, url: s.url });
		}
		return list;
	}, [found]);

	const readChain = useCallback(async (p: Eip1193) => {
		const id = (await p.request({ method: "eth_chainId" })) as string;
		setChainId(Number(BigInt(id)));
	}, []);

	// A change of account or network in the wallet must reflect immediately: otherwise
	// the interface shows one address's balance but transfers from another.
	useEffect(() => {
		const p = active?.provider;
		if (!p?.on) return;
		const onAccounts = (...a: unknown[]) => setAddress((a[0] as string[])?.[0] ?? null);
		const onChain = (...a: unknown[]) => setChainId(Number(BigInt(a[0] as string)));
		p.on("accountsChanged", onAccounts);
		p.on("chainChanged", onChain);
		return () => {
			p.removeListener?.("accountsChanged", onAccounts);
			p.removeListener?.("chainChanged", onChain);
		};
	}, [active]);

	const connect = useCallback(
		async (id: string) => {
			const entry = entries.find((e) => e.id === id);
			// Not installed is not an error but a link. We open the wallet's
			// page instead of failing.
			if (entry && !entry.installed) {
				globalThis.open?.(entry.url, "_blank", "noopener");
				return;
			}

			setConnecting(id);
			setError(null);
			try {
				if (id === WC) {
					const s = await connectEvmWalletConnect(target.chainId);
					setActive({ id, provider: s.provider });
					setWcDisconnect(() => s.disconnect);
					setAddress(s.address);
					await readChain(s.provider);
				} else {
					const w = found.find((f) => f.id === id) ?? legacyProvider();
					if (!w) throw new Error("Wallet is no longer available");
					const accounts = (await w.provider.request({
						method: "eth_requestAccounts",
					})) as string[];
					setActive({ id, provider: w.provider });
					setAddress(accounts[0] ?? null);
					await readChain(w.provider);
				}
				localStorage?.setItem(REMEMBER_KEY, id);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Connection rejected");
			} finally {
				setConnecting(null);
			}
		},
		[entries, found, readChain],
	);

	const disconnect = useCallback(async () => {
		// Injected wallets have no disconnect: the permission is remembered by the
		// wallet itself. We forget the address on our side — that's all the app may do.
		if (wcDisconnect) await wcDisconnect().catch(() => undefined);
		setWcDisconnect(null);
		setActive(null);
		setAddress(null);
		setChainId(null);
		localStorage?.removeItem(REMEMBER_KEY);
	}, [wcDisconnect]);

	const switchChain = useCallback(async () => {
		const p = active?.provider;
		if (!p) return;
		try {
			await p.request({
				method: "wallet_switchEthereumChain",
				params: [{ chainId: target.chainIdHex }],
			});
		} catch (e) {
			// 4902 — the network isn't in the wallet; it must be added first.
			if ((e as { code?: number })?.code !== 4902) throw e;
			await p.request({
				method: "wallet_addEthereumChain",
				params: [
					{
						chainId: target.chainIdHex,
						chainName: target.name,
						rpcUrls: [target.rpc],
						nativeCurrency: target.nativeCurrency,
						blockExplorerUrls: [target.explorer],
					},
				],
			});
		}
		await readChain(p);
	}, [active, readChain, target]);

	const send = useCallback(
		async (to: string, data: string): Promise<string> => {
			const p = active?.provider;
			if (!p || !address) throw new Error("Wallet is not connected");
			if (chainId !== target.chainId) {
				throw new Error(`Switch the wallet to ${target.name} first`);
			}
			return (await p.request({
				method: "eth_sendTransaction",
				params: [{ from: address, to, data }],
			})) as string;
		},
		[active, address, chainId, target],
	);

	return {
		address,
		chainId,
		wrongChain: address !== null && chainId !== null && chainId !== target.chainId,
		chainName: target.name,
		entries,
		connecting,
		remembered,
		error,
		connect,
		disconnect,
		switchChain,
		send,
	};
}
