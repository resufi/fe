import { useCallback, useEffect, useMemo, useState } from "react";
import { HYPEREVM } from "../lib/hyperevm.ts";
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
	/** Куда идти, если не установлен. */
	url?: string;
};

export type EvmWallet = {
	address: string | null;
	chainId: number | null;
	/** Подключён, но сеть не та: переводы делать нельзя. */
	wrongChain: boolean;
	entries: EvmEntry[];
	connecting: string | null;
	remembered: string | null;
	error: string | null;
	connect: (id: string) => Promise<void>;
	disconnect: () => Promise<void>;
	switchChain: () => Promise<void>;
	send: (to: string, data: string) => Promise<string>;
};

const WC = "walletconnect";

export function useEvmWallet(): EvmWallet {
	const [found, setFound] = useState<DiscoveredWallet[]>([]);
	const [active, setActive] = useState<{ id: string; provider: Eip1193 } | null>(null);
	const [wcDisconnect, setWcDisconnect] = useState<(() => Promise<void>) | null>(null);
	const [address, setAddress] = useState<string | null>(null);
	const [chainId, setChainId] = useState<number | null>(null);
	const [connecting, setConnecting] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const remembered =
		typeof localStorage === "undefined" ? null : localStorage.getItem(REMEMBER_KEY);

	// Кошельки объявляют себя событиями, поэтому подписка ставится один раз
	// при монтировании: установленный позже тоже успеет откликнуться.
	useEffect(() => {
		return discover((w) =>
			setFound((prev) => (prev.some((p) => p.id === w.id) ? prev : [...prev, w])),
		);
	}, []);

	/**
	 * Список для показа.
	 *
	 * Сначала то, что действительно установлено — с родными иконками.
	 * Потом WalletConnect, потом предложения поставить. Кошелёк, нашедший
	 * себя сам, из предложений убирается: одна и та же строка дважды сбивает.
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

	// Смена аккаунта или сети в кошельке обязана отражаться сразу: иначе
	// интерфейс покажет баланс одного адреса, а переведёт с другого.
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
			// Не установлен — это не ошибка, а ссылка. Открываем страницу
			// кошелька вместо отказа.
			if (entry && !entry.installed) {
				globalThis.open?.(entry.url, "_blank", "noopener");
				return;
			}

			setConnecting(id);
			setError(null);
			try {
				if (id === WC) {
					const s = await connectEvmWalletConnect();
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
		// У инжектированных кошельков отключения нет: разрешение помнит сам
		// кошелёк. Забываем адрес у себя — это всё, на что приложение вправе.
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
				params: [{ chainId: HYPEREVM.chainIdHex }],
			});
		} catch (e) {
			// 4902 — сети нет в кошельке, сначала её надо добавить.
			if ((e as { code?: number })?.code !== 4902) throw e;
			await p.request({
				method: "wallet_addEthereumChain",
				params: [
					{
						chainId: HYPEREVM.chainIdHex,
						chainName: HYPEREVM.name,
						rpcUrls: [HYPEREVM.rpc],
						nativeCurrency: HYPEREVM.nativeCurrency,
						blockExplorerUrls: [HYPEREVM.explorer],
					},
				],
			});
		}
		await readChain(p);
	}, [active, readChain]);

	const send = useCallback(
		async (to: string, data: string): Promise<string> => {
			const p = active?.provider;
			if (!p || !address) throw new Error("Wallet is not connected");
			if (chainId !== HYPEREVM.chainId) {
				throw new Error(`Switch the wallet to ${HYPEREVM.name} first`);
			}
			return (await p.request({
				method: "eth_sendTransaction",
				params: [{ from: address, to, data }],
			})) as string;
		},
		[active, address, chainId],
	);

	return {
		address,
		chainId,
		wrongChain: address !== null && chainId !== null && chainId !== HYPEREVM.chainId,
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
