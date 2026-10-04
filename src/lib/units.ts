/**
 * Default decimals: nine for tsTON, GRAM and JitoSOL.
 *
 * Split out so formatting doesn't drag in the deploy config.
 *
 * NOTE: the value is shared across all chains, so a pool on an asset with
 * different decimals (tsUSDe — six) must pass it to
 * fmtAmount explicitly. It can't be made six globally: the same
 * functions render TON and Solana amounts.
 */
export const DECIMALS = 9n;
