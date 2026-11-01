import type { ChainId } from "./chains.ts";

import arbitrumMark from "../icons/chains/arbitrum.png";
import baseMark from "../icons/chains/base.svg";
import hyperevmMark from "../icons/chains/hyperevm.png";
import monadMark from "../icons/chains/monad.png";
import robinhoodMark from "../icons/chains/robinhood.png";

/**
 * How a chain signs itself on the connect button.
 *
 * The button used to be neutral (`--accent`) with a generic wallet glyph on
 * every EVM chain, while TON came in its own blue and Solana carried its own
 * mark. Six chains, one anonymous button — nothing told you which network you
 * were about to connect to.
 *
 * The colours are the marks' own: sampled from the logo files themselves, not
 * taken from brand pages, so the tile and the fill are the same colour and the
 * logo has no visible edge on the button.
 */
export type ChainBrand = {
	/** Button fill, and its border. */
	bg: string;
	/** Text and anything else drawn on that fill. */
	fg: string;
	/** The chain's mark, 16px on the button. */
	mark: string;
};

export const CHAIN_BRAND: Partial<Record<ChainId, ChainBrand>> = {
	base: {
		bg: "#0052ff",
		fg: "#ffffff",
		/*
		 * Drawn by us, unlike the other four: the catalogues carry Base as a
		 * blue square on white, which is a picture of a logo rather than a
		 * logo — on a blue button it would show as a white card.
		 */
		mark: baseMark,
	},
	arbitrum: { bg: "#2c374b", fg: "#ffffff", mark: arbitrumMark },
	monad: { bg: "#6e54ff", fg: "#ffffff", mark: monadMark },
	/* Hyperliquid signs itself in mint on near-black green. */
	hyperevm: { bg: "#072723", fg: "#97fce4", mark: hyperevmMark },
	/* The only light fill of the five: the feather on it is black. */
	robinhood: { bg: "#ccff00", fg: "#101010", mark: robinhoodMark },
};
