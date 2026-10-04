import { env } from "./env.ts";
import type { Eip1193 } from "./evmWallets.ts";

/**
 * WalletConnect for HyperEVM.
 *
 * The same approach as walletconnect.ts for Solana, only the namespace is
 * eip155. Kept in a separate file and loaded on demand: the library
 * weighs hundreds of kilobytes and is needed only by whoever chose this method.
 */

export const projectId = () => env("VITE_WALLETCONNECT_PROJECT_ID");

export type EvmWcSession = {
	address: string;
	provider: Eip1193;
	disconnect: () => Promise<void>;
};

export async function connectEvmWalletConnect(chainId: number): Promise<EvmWcSession> {
	const id = projectId();
	if (!id) {
		throw new Error(
			"WalletConnect is not configured: VITE_WALLETCONNECT_PROJECT_ID is missing.",
		);
	}

	const [{ default: UniversalProvider }, { WalletConnectModal }] = await Promise.all([
		import("@walletconnect/universal-provider"),
		import("@walletconnect/modal"),
	]);

	const provider = await UniversalProvider.init({
		projectId: id,
		metadata: {
			name: "Resu",
			description: "Staking where you pick your place in the loss queue",
			url: globalThis.location?.origin ?? "https://resufi.github.io",
			icons: [`${globalThis.location?.origin ?? ""}/icon-1024.png`],
		},
	});

	const chain = `eip155:${chainId}`;

	// The provider emits the link via a display_uri event. Without a shown QR code
	// there's nothing to scan, and the connection just waits — from outside that
	// looks like an endless load. On Solana we already got burned by this.
	const modal = new WalletConnectModal({ projectId: id, chains: [chain] });
	const onUri = (uri: string) => void modal.openModal({ uri });
	provider.on("display_uri", onUri);

	let cancelled = false;
	const unsubscribe = modal.subscribeModal((s: { open: boolean }) => {
		if (!s.open) cancelled = true;
	});

	try {
		await provider.connect({
			optionalNamespaces: {
				eip155: {
					chains: [chain],
					methods: [
						"eth_sendTransaction",
						"personal_sign",
						"wallet_switchEthereumChain",
						"wallet_addEthereumChain",
					],
					events: ["accountsChanged", "chainChanged"],
				},
			},
		});
	} finally {
		provider.removeListener("display_uri", onUri);
		unsubscribe();
		modal.closeModal();
	}

	const accounts = provider.session?.namespaces?.eip155?.accounts ?? [];
	// Format eip155:999:0xaddress — we need the last segment.
	const address = accounts[0]?.split(":").pop() ?? null;
	if (!address) {
		throw new Error(cancelled ? "Connection cancelled" : "The wallet returned no address");
	}

	return {
		address,
		provider: provider as unknown as Eip1193,
		disconnect: async () => {
			await provider.disconnect().catch(() => undefined);
		},
	};
}
