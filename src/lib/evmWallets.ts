/**
 * EVM wallet discovery.
 *
 * Under EIP-6963 wallets announce themselves: name, icon and their provider.
 * This is noticeably better than what we did on Solana, where three wallets are
 * hardcoded along with hand-drawn icons. Here the list comes out
 * real — whatever a person has installed is shown, with its native icon.
 *
 * The old way, window.ethereum, is kept as a fallback: several installed
 * wallets fight over that field, and who wins is unknown. That is exactly why
 * EIP-6963 came to be.
 */

export type Eip1193 = {
	request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
	on?: (event: string, handler: (...args: unknown[]) => void) => void;
	removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export type DiscoveredWallet = {
	/** rdns, e.g. io.rabby. Stable across runs, unlike uuid. */
	id: string;
	name: string;
	/** a data: icon from the wallet itself. */
	icon: string;
	provider: Eip1193;
};

type AnnounceEvent = CustomEvent<{
	info: { uuid: string; name: string; icon: string; rdns: string };
	provider: Eip1193;
}>;

/**
 * Wallets we suggest installing if nothing is found.
 *
 * The order isn't random: Rabby works most closely with HyperEVM and shows
 * its networks out of the box; MetaMask works, but on HyperEVM it sometimes
 * stumbles. Phantom is deliberately absent — it doesn't suit Hyperliquid.
 */
export const SUGGESTED = [
	{ id: "io.rabby", name: "Rabby", url: "https://rabby.io" },
	{ id: "io.metamask", name: "MetaMask", url: "https://metamask.io" },
	{ id: "com.okex.wallet", name: "OKX Wallet", url: "https://okx.com/web3" },
	{ id: "com.bitget.web3", name: "Bitget Wallet", url: "https://web3.bitget.com" },
] as const;

/**
 * Ask for the installed wallets.
 *
 * The answer comes as events, synchronously at request time, so the subscription
 * is set up BEFORE it. The reverse order would find nothing.
 */
export function discover(onFound: (w: DiscoveredWallet) => void): () => void {
	if (typeof window === "undefined") return () => undefined;

	const handler = (e: Event) => {
		const { info, provider } = (e as AnnounceEvent).detail;
		onFound({ id: info.rdns, name: info.name, icon: info.icon, provider });
	};

	window.addEventListener("eip6963:announceProvider", handler);
	window.dispatchEvent(new Event("eip6963:requestProvider"));
	return () => window.removeEventListener("eip6963:announceProvider", handler);
}

/**
 * A fallback for wallets that don't support EIP-6963.
 *
 * We guess the name from flags: there's no standard for them, but they're settled, and
 * a nameless row in the list is worse than an approximate name.
 */
export function legacyProvider(): DiscoveredWallet | null {
	const eth = (globalThis as { window?: { ethereum?: Eip1193 & Record<string, boolean> } })
		.window?.ethereum;
	if (!eth) return null;
	const name = eth.isRabby
		? "Rabby"
		: eth.isMetaMask
			? "MetaMask"
			: eth.isOkxWallet || eth.isOKExWallet
				? "OKX Wallet"
				: eth.isBitKeep
					? "Bitget Wallet"
					: "Browser wallet";
	return { id: "injected", name, icon: "", provider: eth };
}

export const isMobile = (): boolean =>
	typeof navigator !== "undefined" && /android|iphone|ipad/i.test(navigator.userAgent);
