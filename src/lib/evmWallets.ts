/**
 * Обнаружение кошельков EVM.
 *
 * По EIP-6963 кошельки объявляют себя сами: имя, иконку и свой провайдер.
 * Это заметно лучше того, что мы сделали на Solana, где три кошелька зашиты
 * в код вместе с нарисованными вручную значками. Здесь список получается
 * настоящим — что у человека установлено, то и покажется, с родной иконкой.
 *
 * Старый способ, window.ethereum, оставлен запасным: несколько установленных
 * кошельков дерутся за это поле, и кто победит — неизвестно. Именно ради
 * этого EIP-6963 и появился.
 */

export type Eip1193 = {
	request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
	on?: (event: string, handler: (...args: unknown[]) => void) => void;
	removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export type DiscoveredWallet = {
	/** rdns, например io.rabby. Устойчив между запусками, в отличие от uuid. */
	id: string;
	name: string;
	/** data:-иконка от самого кошелька. */
	icon: string;
	provider: Eip1193;
};

type AnnounceEvent = CustomEvent<{
	info: { uuid: string; name: string; icon: string; rdns: string };
	provider: Eip1193;
}>;

/**
 * Кошельки, которые предлагаем поставить, если ничего не найдено.
 *
 * Порядок не случаен: Rabby плотнее всех работает с HyperEVM и показывает
 * его сети из коробки, MetaMask работает, но на HyperEVM у него бывают
 * заминки. Phantom в списке нет намеренно — для Hyperliquid он не подходит.
 */
export const SUGGESTED = [
	{ id: "io.rabby", name: "Rabby", url: "https://rabby.io" },
	{ id: "io.metamask", name: "MetaMask", url: "https://metamask.io" },
	{ id: "com.okex.wallet", name: "OKX Wallet", url: "https://okx.com/web3" },
	{ id: "com.bitget.web3", name: "Bitget Wallet", url: "https://web3.bitget.com" },
] as const;

/**
 * Спросить установленные кошельки.
 *
 * Ответ приходит событиями, синхронно в момент запроса, поэтому подписка
 * ставится ДО него. Обратный порядок не нашёл бы ничего.
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
 * Запасной путь для кошельков, не умеющих EIP-6963.
 *
 * Имя угадываем по флагам: стандарта на них нет, но они устоялись, а
 * безымянная строка в списке хуже приблизительного имени.
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
