import type { Mandate } from "./config.ts";
import type { EvmPoolContracts } from "./evm.ts";

/**
 * Пул buffered-note на Robinhood Chain: транширование токенизированного SPY.
 *
 * Контракт — OracleVault: цена SPY читается из Chainlink, senior получает
 * фиксированный купон и защищён первым буфером, junior берёт рычаг на
 * движение цены. Адреса сверены с самим пулом через trancheTokens(i) —
 * сводка Foundry переставляет подписи, ей верить нельзя.
 *
 * Раскладка задана в resu-sc-evm/src/OracleVault.sol.
 */
export const CONTRACTS: EvmPoolContracts = {
	chain: "robinhood",
	vault: "0x5285F357Eb16E6fd40ba73fCA4F37776A3A5d129",
	/** Токенизированный SPY (SPDR S&P 500), 18 знаков, Stylus-контракт. */
	asset: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C",
	trancheTokens: [
		"0x8a8CB825f4CCd2e93604e828f62C3ce3f5C8F464", // jrSPY
		"0xb996a0D4Fe810f6Fc863533b49B4581fC5348B49", // mlSPY
		"0xb555F9D5eF631868cF070Fe3466765E26502693A", // srSPY
	],
};

/**
 * Мандат. Купоны senior 6% / mezz 10%, окно выхода сутки.
 *
 * Экономика купонная, как на HyperEVM: senior получает ставку, а не платит
 * за защиту. Поля fee — нули, купоны — в отдельных полях.
 */
export const MANDATE: Mandate = {
	maxLossBps: 0,
	withdrawDelay: 86400,
	seniorFeeBps: 0,
	seniorFeeToMezzBps: 0,
	mezzFeeBps: 0,
	seniorRateBps: 600,
	mezzRateBps: 1000,
	// Все суммы в OracleVault — wad USD (1e18). Минимум $10.
	minDeposit: (10n ** 18n * 10n).toString(),
};
