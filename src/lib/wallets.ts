import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { solanaDeployment } from "./solana.ts";

export type WalletId = "walletconnect" | "phantom" | "trust";

export type WalletDef = {
	id: WalletId;
	name: string;

	standardName?: string;

	installUrl?: string;

	deepLink?: (url: string) => string;
};

export const WALLETS: WalletDef[] = [
	{
		id: "walletconnect",
		name: "WalletConnect",
	},
	{
		id: "phantom",
		name: "Phantom",
		standardName: "Phantom",
		installUrl: "https://phantom.app/download",
		deepLink: (url) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}`,
	},
	{
		id: "trust",
		name: "Trust",
		standardName: "Trust",
		installUrl: "https://trustwallet.com/download",
		deepLink: (url) => `https://link.trustwallet.com/open_url?url=${encodeURIComponent(url)}`,
	},
];

const CONNECT = "standard:connect";
const DISCONNECT = "standard:disconnect";
const SIGN_AND_SEND = "solana:signAndSendTransaction";

export const solanaChain = (): `solana:${string}` =>
	solanaDeployment.network === "mainnet" ? "solana:mainnet" : "solana:devnet";

function usable(w: Wallet): boolean {
	return CONNECT in w.features && SIGN_AND_SEND in w.features;
}

export function findInstalled(def: WalletDef): Wallet | null {
	if (!def.standardName) return null;
	return (
		getWallets()
			.get()
			.find((w) => usable(w) && w.name.toLowerCase().includes(def.standardName!.toLowerCase())) ??
		null
	);
}

export function watchInstalled(onChange: () => void): () => void {
	const api = getWallets();
	const offRegister = api.on("register", onChange);
	const offUnregister = api.on("unregister", onChange);
	return () => {
		offRegister();
		offUnregister();
	};
}

export const isMobile = () =>
	typeof navigator !== "undefined" && /android|iphone|ipad|ipod/i.test(navigator.userAgent);

export async function connectStandard(w: Wallet): Promise<WalletAccount> {
	const feature = w.features[CONNECT] as {
		connect: () => Promise<{ accounts: readonly WalletAccount[] }>;
	};
	const { accounts } = await feature.connect();
	const account = accounts.find((a) => a.chains.includes(solanaChain())) ?? accounts[0];
	if (!account) throw new Error("Кошелёк не вернул ни одного счёта");
	return account;
}

export async function disconnectStandard(w: Wallet): Promise<void> {
	const feature = w.features[DISCONNECT] as { disconnect: () => Promise<void> } | undefined;

	await feature?.disconnect();
}

export async function signAndSendStandard(
	w: Wallet,
	account: WalletAccount,
	transaction: Uint8Array,
): Promise<Uint8Array> {
	const feature = w.features[SIGN_AND_SEND] as {
		signAndSendTransaction: (input: {
			account: WalletAccount;
			chain: string;
			transaction: Uint8Array;
		}) => Promise<readonly { signature: Uint8Array }[]>;
	};
	const [res] = await feature.signAndSendTransaction({
		account,
		chain: solanaChain(),
		transaction,
	});
	return res.signature;
}
