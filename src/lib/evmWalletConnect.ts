import { env } from "./env.ts";
import { HYPEREVM } from "./hyperevm.ts";
import type { Eip1193 } from "./evmWallets.ts";

/**
 * WalletConnect для HyperEVM.
 *
 * Тот же приём, что в walletconnect.ts для Solana, только пространство имён
 * eip155. Держится отдельным файлом и грузится по требованию: библиотека
 * весит сотни килобайт, а нужна только тому, кто выбрал этот способ.
 */

export const projectId = () => env("VITE_WALLETCONNECT_PROJECT_ID");

export type EvmWcSession = {
	address: string;
	provider: Eip1193;
	disconnect: () => Promise<void>;
};

export async function connectEvmWalletConnect(): Promise<EvmWcSession> {
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

	const chain = `eip155:${HYPEREVM.chainId}`;

	// Провайдер отдаёт ссылку событием display_uri. Без показанного QR-кода
	// человеку нечего сканировать, а подключение просто ждёт — снаружи это
	// выглядит как вечная загрузка. На Solana мы уже на этом обожглись.
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
	// Формат eip155:999:0xадрес — нужен последний сегмент.
	const address = accounts[0]?.split(":").pop() ?? null;
	if (!address) {
		throw new Error(cancelled ? "Подключение отменено" : "Кошелёк не вернул адрес");
	}

	return {
		address,
		provider: provider as unknown as Eip1193,
		disconnect: async () => {
			await provider.disconnect().catch(() => undefined);
		},
	};
}
