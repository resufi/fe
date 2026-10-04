import type { Mandate } from "./config.ts";
import type { EvmPoolContracts } from "./evm.ts";

/**
 * Buffered-note pool on Monad: tranching aprMON (staked MON).
 *
 * aprMON is aPriori's ERC-4626 LST (the leading Monad LST: staking + MEV).
 * There is no direct aprMON/USD feed, so the price comes from our LstRateFeed
 * adapter:
 *   aprMON/USD = MON/USD (Chainlink) x (aprMON->MON rate from ERC-4626).
 * That way aprMON's accrued staking yield flows into pool NAV on top of MON's
 * price.
 *
 * The contract is OracleVault (coupon model): senior earns a fixed coupon and
 * is protected by the buffer, junior takes the leveraged yield + price. All
 * amounts are wad USD. Addresses from the 2026-10-05 deployment; junior ->
 * senior order verified against trancheId().
 */
export const CONTRACTS: EvmPoolContracts = {
	chain: "monad",
	vault: "0x804E56c448A14611ECAC4cf07a222878820e3876",
	/** aprMON (aPriori LST over MON), 18 decimals. */
	asset: "0x0c65A0BC65a5D819235B71F554D210D3F80E0852",
	trancheTokens: [
		"0x5285F357Eb16E6fd40ba73fCA4F37776A3A5d129", // jraprMON
		"0x8a8CB825f4CCd2e93604e828f62C3ce3f5C8F464", // mlaprMON
		"0xb996a0D4Fe810f6Fc863533b49B4581fC5348B49", // sraprMON
	],
};

/** High volatility of a young L1: buffer 35/35/30, coupons senior 7% / mezz 12%. */
export const MANDATE: Mandate = {
	maxLossBps: 0,
	withdrawDelay: 86400,
	seniorFeeBps: 0,
	seniorFeeToMezzBps: 0,
	mezzFeeBps: 0,
	seniorRateBps: 700,
	mezzRateBps: 1200,
	// All OracleVault amounts are wad USD (1e18). Minimum $10.
	minDeposit: (10n ** 18n * 10n).toString(),
};
