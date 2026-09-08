import { env } from "./env.ts";
import { solanaDeployment } from "./solana.ts";

/**
 * Подключение по WalletConnect: QR-код на десктопе, переход в приложение
 * на телефоне.
 *
 * Модуль тяжёлый (несколько сотен килобайт), поэтому загружается только при
 * выборе этого способа — динамическим импортом, а не в общем бандле.
 */

/** CAIP-2 идентификаторы сетей Solana. */
const CHAIN = {
	mainnet: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
	devnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
} as const;

const chainId = () =>
	solanaDeployment.network === "mainnet" ? CHAIN.mainnet : CHAIN.devnet;

export const projectId = () => env("VITE_WALLETCONNECT_PROJECT_ID");

export type WcSession = {
	address: string;
	signAndSend: (transaction: Uint8Array) => Promise<string>;
	disconnect: () => Promise<void>;
};

let cached: { provider: unknown } | null = null;

export async function connectWalletConnect(): Promise<WcSession> {
	const id = projectId();
	if (!id) {
		throw new Error(
			"WalletConnect не настроен: нужен VITE_WALLETCONNECT_PROJECT_ID " +
				"(бесплатно на dashboard.reown.com)",
		);
	}

	const [{ default: UniversalProvider }, { WalletConnectModal }] = await Promise.all([
		import("@walletconnect/universal-provider"),
		import("@walletconnect/modal"),
	]);

	const provider =
		(cached?.provider as InstanceType<typeof UniversalProvider> | undefined) ??
		(await UniversalProvider.init({
			projectId: id,
			metadata: {
				name: "Resu",
				description: "Staking where you pick your place in the loss queue",
				url: window.location.origin,
				icons: [`${window.location.origin}/icon.png`],
			},
		}));
	cached = { provider };

	const chain = chainId();

	// Провайдер отдаёт ссылку для подключения событием display_uri. Без
	// показанного QR-кода человеку нечего сканировать, а подключение просто
	// ждёт — снаружи это выглядит как вечная загрузка.
	const modal = new WalletConnectModal({
		projectId: id,
		chains: [chain],
		// Список сознательно короткий: те же кошельки, что и в нашей модалке.
		explorerRecommendedWalletIds: undefined,
	});

	const onUri = (uri: string) => {
		void modal.openModal({ uri });
	};
	provider.on("display_uri", onUri);

	// Закрытие окна человеком — обычный отказ, а не сбой: подключение
	// должно оборваться, а не висеть.
	let cancelled = false;
	const unsubscribe = modal.subscribeModal((state: { open: boolean }) => {
		if (!state.open) cancelled = true;
	});

	let session;
	try {
		session = await provider.connect({
			optionalNamespaces: {
				solana: {
					chains: [chain],
					// signAndSendTransaction поддерживают не все кошельки; просим
					// оба метода, а какой применить — решаем по ответу сессии.
					methods: ["solana_signAndSendTransaction", "solana_signTransaction"],
					events: [],
				},
			},
		});
	} finally {
		provider.removeListener("display_uri", onUri);
		unsubscribe();
		modal.closeModal();
	}

	if (cancelled && !session) throw new Error("Подключение отменено");

	const accounts = session?.namespaces?.solana?.accounts ?? [];
    if (accounts.length === 0) throw new Error("Кошелёк не вернул ни одного счёта");
	// Формат: "solana:<chain>:<address>"
	const address = accounts[0].split(":").pop()!;

	const methods = session?.namespaces?.solana?.methods ?? [];

	return {
		address,
		async signAndSend(transaction: Uint8Array): Promise<string> {
			const encoded = btoa(String.fromCharCode(...transaction));
			if (methods.includes("solana_signAndSendTransaction")) {
				const res = (await provider.request(
					{ method: "solana_signAndSendTransaction", params: { transaction: encoded } },
					chain,
				)) as { signature: string };
				return res.signature;
			}
			// Запасной путь: кошелёк только подписывает, отправляем сами.
			const res = (await provider.request(
				{ method: "solana_signTransaction", params: { transaction: encoded } },
				chain,
			)) as { transaction?: string; signature?: string };
			if (res.signature) return res.signature;
			throw new Error("Кошелёк не поддерживает отправку транзакций");
		},
		async disconnect() {
			await provider.disconnect().catch(() => undefined);
			cached = null;
		},
	};
}
