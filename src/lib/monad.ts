import type { Mandate } from "./config.ts";
import type { EvmPoolContracts } from "./evm.ts";

export const CONTRACTS: EvmPoolContracts = {
	chain: "monad",
	vault: "0x804E56c448A14611ECAC4cf07a222878820e3876",

	asset: "0x0c65A0BC65a5D819235B71F554D210D3F80E0852",
	trancheTokens: [
		"0x5285F357Eb16E6fd40ba73fCA4F37776A3A5d129", // jraprMON
		"0x8a8CB825f4CCd2e93604e828f62C3ce3f5C8F464", // mlaprMON
		"0xb996a0D4Fe810f6Fc863533b49B4581fC5348B49", // sraprMON
	],
};

export const MANDATE: Mandate = {
	maxLossBps: 0,
	withdrawDelay: 86400,
	seniorFeeBps: 0,
	seniorFeeToMezzBps: 0,
	mezzFeeBps: 0,
	seniorRateBps: 700,
	mezzRateBps: 1200,
	weights: [35, 35, 30],

	minDeposit: (10n ** 18n * 10n).toString(),
};
