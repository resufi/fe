import { env } from "./env.ts";
import type { Eip1193 } from "./evmWallets.ts";

export const projectId = () => env("VITE_WALLETCONNECT_PROJECT_ID");

export type EvmWcSession = {
	address: string;
	/** The chain the wallet actually approved, taken from the session — not from
	 * an `eth_chainId` RPC, which on UniversalProvider returns an unset default. */
	chainId: number;
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

	// A CAIP-10 account is "eip155:<chainId>:<address>". Read both from it: the
	// address is the last segment, the approved chain the middle one.
	const parts = accounts[0]?.split(":") ?? [];
	const address = parts.length === 3 ? parts[2] : null;
	const sessionChainId = parts.length === 3 ? Number(parts[1]) : NaN;
	if (!address) {
		throw new Error(cancelled ? "Connection cancelled" : "The wallet returned no address");
	}

	// Pin the default chain so eth_chainId / eth_sendTransaction route to it rather
	// than to UniversalProvider's unset default (which otherwise reports chain 1).
	const resolvedChainId = Number.isFinite(sessionChainId) ? sessionChainId : chainId;
	try {
		provider.setDefaultChain(`eip155:${resolvedChainId}`);
	} catch {
		/* older provider without setDefaultChain — session is single-chain anyway */
	}

	return {
		address,
		chainId: resolvedChainId,
		provider: provider as unknown as Eip1193,
		disconnect: async () => {
			await provider.disconnect().catch(() => undefined);
		},
	};
}
