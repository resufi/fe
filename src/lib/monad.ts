import type { Mandate } from "./config.ts";
import type { EvmPoolContracts } from "./evm.ts";

/**
 * Пул buffered-note на Monad: транширование aprMON (застейканный MON).
 *
 * aprMON — ERC-4626-LST протокола aPriori (ведущий LST Monad: стейкинг + MEV).
 * Прямого фида aprMON/USD нет, поэтому цену даёт наш адаптер LstRateFeed:
 *   aprMON/USD = MON/USD (Chainlink) x (курс aprMON->MON из ERC-4626).
 * Так накопленный стейкинг-доход aprMON попадает в NAV пула поверх цены MON.
 *
 * Контракт — OracleVault (coupon-модель): senior получает фиксированный купон
 * и защищён буфером, junior берёт рычаг на доход+цену. Все суммы в wad USD.
 * Адреса из развёртывания 2026-10-05; порядок junior -> senior сверен с
 * trancheId().
 */
export const CONTRACTS: EvmPoolContracts = {
	chain: "monad",
	vault: "0x804E56c448A14611ECAC4cf07a222878820e3876",
	/** aprMON (aPriori LST над MON), 18 знаков. */
	asset: "0x0c65A0BC65a5D819235B71F554D210D3F80E0852",
	trancheTokens: [
		"0x5285F357Eb16E6fd40ba73fCA4F37776A3A5d129", // jraprMON
		"0x8a8CB825f4CCd2e93604e828f62C3ce3f5C8F464", // mlaprMON
		"0xb996a0D4Fe810f6Fc863533b49B4581fC5348B49", // sraprMON
	],
};

/** Высокая волатильность нового L1: буфер 35/35/30, купоны senior 7% / mezz 12%. */
export const MANDATE: Mandate = {
	maxLossBps: 0,
	withdrawDelay: 86400,
	seniorFeeBps: 0,
	seniorFeeToMezzBps: 0,
	mezzFeeBps: 0,
	seniorRateBps: 700,
	mezzRateBps: 1200,
	// Все суммы в OracleVault — wad USD (1e18). Минимум $10.
	minDeposit: (10n ** 18n * 10n).toString(),
};
