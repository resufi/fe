import type { Mandate } from "./config.ts";
import type { EvmPoolContracts } from "./evm.ts";

/**
 * Пулы buffered-note на Base: транширование токенизированных акций Coinbase
 * (стандарт B20). Контракт — OracleVault: цена читается из Chainlink, senior
 * получает фиксированный купон и защищён буфером, junior берёт рычаг на цену.
 *
 * B20-токены — Rust-прекомпайлы (как Stylus): разрядность актива (8) и фида
 * задаётся параметром при деплое, не читается симулятором. Все суммы пула в
 * wad USD (1e18). Адреса из развёртывания 2026-10-01; порядок junior -> senior
 * сверен с trancheId().
 */

/** MSFT (Microsoft), мегакап. Буфер 20/20/60, купоны senior 6% / mezz 10%. */
export const MSFT: EvmPoolContracts = {
	chain: "base",
	vault: "0x80669f196620597AC5740416CB85754761Ccb786",
	/** MSFTc, B20, 8 знаков. */
	asset: "0xB200000000000000000000Ab99cFa739E253872B",
	trancheTokens: [
		"0xa639fB9C115E0C7f71119137e69080B6472526F9", // jrMSFT
		"0x162507d813030eB5845e349787a8F040f1cc2F63", // mlMSFT
		"0xE078943a7C021b5d9ADCD94F2bC3A52C8fa26FE6", // srMSFT
	],
};

export const MSFT_MANDATE: Mandate = {
	maxLossBps: 0,
	withdrawDelay: 345600, // 4 дня: фид стоков по выходным не обновляется
	seniorFeeBps: 0,
	seniorFeeToMezzBps: 0,
	mezzFeeBps: 0,
	seniorRateBps: 600,
	mezzRateBps: 1000,
	minDeposit: (10n ** 18n * 10n).toString(),
};

/** NVDA (Nvidia), AI-мегакап, высокая бета. Буфер 30/30/40, купоны 7% / 12%. */
export const NVDA: EvmPoolContracts = {
	chain: "base",
	vault: "0xb555F9D5eF631868cF070Fe3466765E26502693A",
	/** NVDAc, B20, 8 знаков. */
	asset: "0xb20000000000000000000078ee7ce2fE4908108C",
	trancheTokens: [
		"0xb445c52873e0dd11fa9a0571A8Ba2aE96FDf17b7", // jrNVDA
		"0x9de2b4325A0ADE2AFb399F73D7e3C4DC5142E660", // mlNVDA
		"0x21df86a36e3Cbe48f39B228C17696D0e6F872563", // srNVDA
	],
};

export const NVDA_MANDATE: Mandate = {
	maxLossBps: 0,
	withdrawDelay: 345600,
	seniorFeeBps: 0,
	seniorFeeToMezzBps: 0,
	mezzFeeBps: 0,
	seniorRateBps: 700,
	mezzRateBps: 1200,
	minDeposit: (10n ** 18n * 10n).toString(),
};
