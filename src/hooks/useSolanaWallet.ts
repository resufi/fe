import { useCallback, useEffect, useState } from "react";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import {
	connectStandard,
	disconnectStandard,
	findInstalled,
	isMobile,
	signAndSendStandard,
	watchInstalled,
	WALLETS,
	type WalletDef,
	type WalletId,
} from "../lib/wallets.ts";
import { connectWalletConnect, type WcSession } from "../lib/walletconnect.ts";

const STORAGE_KEY = "resu:solana-wallet";

/** Состояние варианта в списке: подключаться, ставить или сканировать QR. */
export type WalletEntry = WalletDef & { installed: boolean };

/**
 * Подключение кошелька Solana.
 *
 * Два разных механизма под одним интерфейсом: расширение в браузере
 * (Wallet Standard) и удалённый кошелёк по WalletConnect. Наружу они
 * выглядят одинаково — адрес и способ подписать транзакцию.
 */
export function useSolanaWallet() {
	const [tick, setTick] = useState(0);
	const [standard, setStandard] = useState<{ wallet: Wallet; account: WalletAccount } | null>(null);
	const [wc, setWc] = useState<WcSession | null>(null);
	const [connecting, setConnecting] = useState<WalletId | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Расширения регистрируются асинхронно — пересчитываем список по событию.
	useEffect(() => watchInstalled(() => setTick((t) => t + 1)), []);

	const entries: WalletEntry[] = WALLETS.map((def) => ({
		...def,
		installed: def.id === "walletconnect" ? true : findInstalled(def) !== null,
	}));
	void tick;

	const address = standard?.account.address ?? wc?.address ?? null;

	const connect = useCallback(async (id: WalletId) => {
		const def = WALLETS.find((w) => w.id === id)!;
		setConnecting(id);
		setError(null);
		try {
			if (id === "walletconnect") {
				setWc(await connectWalletConnect());
			} else {
				const installed = findInstalled(def);
				if (!installed) {
					// Не установлен: на телефоне открываем приложение, на
					// десктопе — страницу установки. Молча ничего не делать
					// хуже всего.
					const url = isMobile() && def.deepLink
						? def.deepLink(window.location.href)
						: def.installUrl;
					if (url) window.open(url, "_blank", "noopener");
					return;
				}
				setStandard({ wallet: installed, account: await connectStandard(installed) });
			}
			try {
				localStorage.setItem(STORAGE_KEY, id);
			} catch {
				// приватный режим — не повод падать
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Не удалось подключиться";
			// Отказ в кошельке — обычное действие пользователя, а не сбой.
			setError(/reject|denied|cancel|closed/i.test(msg) ? null : msg);
		} finally {
			setConnecting(null);
		}
	}, []);

	const disconnect = useCallback(async () => {
		if (standard) await disconnectStandard(standard.wallet).catch(() => undefined);
		if (wc) await wc.disconnect().catch(() => undefined);
		setStandard(null);
		setWc(null);
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			// см. выше
		}
	}, [standard, wc]);

	/** Подписать и отправить. Путь зависит от того, чем подключились. */
	const signAndSend = useCallback(
		async (transaction: Uint8Array): Promise<string> => {
			if (wc) return wc.signAndSend(transaction);
			if (standard) {
				const sig = await signAndSendStandard(
					standard.wallet,
					standard.account,
					transaction,
				);
				return bs58(sig);
			}
			throw new Error("Кошелёк не подключён");
		},
		[standard, wc],
	);

	const remembered = (() => {
		try {
			return localStorage.getItem(STORAGE_KEY) as WalletId | null;
		} catch {
			return null;
		}
	})();

	return { entries, address, connecting, error, remembered, connect, disconnect, signAndSend };
}

/** Подпись приходит байтами, а ищут её в обозревателях в base58. */
function bs58(bytes: Uint8Array): string {
	const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
	let n = 0n;
	for (const b of bytes) n = n * 256n + BigInt(b);
	let out = "";
	while (n > 0n) {
		out = ALPHABET[Number(n % 58n)] + out;
		n /= 58n;
	}
	for (const b of bytes) {
		if (b !== 0) break;
		out = "1" + out;
	}
	return out;
}
