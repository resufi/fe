import type { Mandate } from "./config.ts";
import type { EvmPoolContracts } from "./evm.ts";

/**
 * Пул buffered-note на Arbitrum One: транширование WETH.
 *
 * Контракт — OracleVault: цена ETH читается из Chainlink (ETH/USD), senior
 * получает фиксированный купон и защищён буфером junior+mezzanine, junior
 * берёт рычаг на движение цены. Все суммы пула в wad USD (1e18).
 *
 * Адреса из развёртывания 2026-10-01; порядок траншей junior -> senior сверен
 * с trancheId() самих токенов.
 */
export const CONTRACTS: EvmPoolContracts = {
	chain: "arbitrum",
	vault: "0x8a8CB825f4CCd2e93604e828f62C3ce3f5C8F464",
	/** WETH, 18 знаков. */
	asset: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
	trancheTokens: [
		"0xb996a0D4Fe810f6Fc863533b49B4581fC5348B49", // jrETH
		"0xb555F9D5eF631868cF070Fe3466765E26502693A", // mlETH
		"0xb445c52873e0dd11fa9a0571A8Ba2aE96FDf17b7", // srETH
	],
};

/** Купоны senior 6% / mezz 10%, окно выхода сутки. Буфер 35/35/30. */
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
