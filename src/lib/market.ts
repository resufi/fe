/**
 * US equity hours. Tokenized stocks (SPY, MSFT, NVDA) only have a live price
 * while the US market is open — weekdays 9:30–16:00 ET. On weekends and outside
 * those hours the feed is paused: deposits still work, but values don't move.
 */

const STOCKS = new Set(["SPY", "MSFT", "NVDA"]);

/** True for a pool whose asset is a tokenized US stock. */
export const isStockAsset = (asset: string): boolean => STOCKS.has(asset);

/** True when the US stock market is currently closed (weekend or off-hours). */
export function usMarketClosed(now: Date = new Date()): boolean {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "America/New_York",
		weekday: "short",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).formatToParts(now);
	const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";

	const day = get("weekday");
	if (day === "Sat" || day === "Sun") return true;

	let hh = Number(get("hour"));
	if (hh === 24) hh = 0;
	const mins = hh * 60 + Number(get("minute"));
	return mins < 9 * 60 + 30 || mins >= 16 * 60;
}
