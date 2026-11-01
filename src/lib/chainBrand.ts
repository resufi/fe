import type { ChainId } from "./chains.ts";

import arbitrumMark from "../icons/chains/arbitrum-mono.png";
import baseMark from "../icons/chains/base.svg";
import hyperevmMark from "../icons/chains/hyperevm.png";
import monadMark from "../icons/chains/monad.png";
import robinhoodMark from "../icons/chains/robinhood.png";

export type ChainBrand = {
	bg: string;

	fg: string;

	mark: string;

	mono?: boolean;
};

export const CHAIN_BRAND: Partial<Record<ChainId, ChainBrand>> = {
	base: {
		bg: "#0052ff",
		fg: "#ffffff",

		mark: baseMark,
	},

	arbitrum: { bg: "#2c374b", fg: "#ffffff", mark: arbitrumMark, mono: true },
	monad: { bg: "#6e54ff", fg: "#ffffff", mark: monadMark },

	hyperevm: { bg: "#072723", fg: "#97fce4", mark: hyperevmMark },

	robinhood: { bg: "#ccff00", fg: "#101010", mark: robinhoodMark },
};
