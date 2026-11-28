/**
 * Asset-type navigation.
 *
 * The app is entered by **what you are protecting**, not by which chain it
 * happens to run on: a person looking for stocks should not have to first know
 * that those stocks live on Base. Chain is a filter inside a category, never the
 * front door.
 *
 * Order is deliberate: the safer, more familiar classes first.
 */
export type CategoryId =
	| "stable"
	| "staking"
	| "rwa"
	| "stocks"
	| "crypto"
	| "project0";

export type Category = {
	id: CategoryId;
	label: string;
	/** One line, plain language: what the assets are. */
	blurb: string;
	/** What a cautious and a greedy user can expect here. */
	senior: string;
	junior: string;
};

export const CATEGORIES: Category[] = [
	{
		id: "stable",
		label: "Stable Yield",
		blurb: "Yield-bearing stablecoins and dollar counters.",
		senior: "Steady, dollar-denominated.",
		junior: "Amplified dollar yield.",
	},
	{
		id: "staking",
		label: "Staking",
		blurb: "Liquid staking tokens that appreciate on their own.",
		senior: "Protected from the pool's losses.",
		junior: "Staking yield plus a fee on top.",
	},
	{
		id: "rwa",
		label: "RWA",
		blurb: "Tokenized real-world assets: funds and indices.",
		senior: "A fixed coupon, deep buffer.",
		junior: "Leveraged price exposure.",
	},
	{
		id: "stocks",
		label: "Stocks",
		blurb: "Tokenized single-name equities.",
		senior: "A fixed coupon, deep buffer.",
		junior: "Leveraged price exposure.",
	},
	{
		id: "crypto",
		label: "Crypto",
		blurb: "Volatile crypto assets.",
		senior: "A fixed coupon, deep buffer.",
		junior: "Leveraged price exposure.",
	},
	{
		id: "project0",
		label: "Project Ø",
		blurb: "Lending yield from Project Ø (marginfi), tranched.",
		senior: "Protected from pool losses.",
		junior: "Lending rate, amplified.",
	},
];

export const findCategory = (id: string): Category | undefined =>
	CATEGORIES.find((c) => c.id === id);

const STORAGE_KEY = "resu:category";

export function loadCategory(): CategoryId | null {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved && findCategory(saved)) return saved as CategoryId;
	} catch {
		// private mode or blocked storage
	}
	return null;
}

export function saveCategory(id: CategoryId | null): void {
	try {
		if (id) localStorage.setItem(STORAGE_KEY, id);
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// see above
	}
}
