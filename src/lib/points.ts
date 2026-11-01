export type AddressPoints = {
	rank: number;
	address: string;
	points: number;
	byToken: Record<string, number>;
};

export type PointsResult = {
	generatedAt: string | null;
	unit: string;
	totalPoints: number;
	holders: number;
	leaderboard: AddressPoints[];
};

export async function fetchPoints(): Promise<PointsResult | null> {
	try {
		const url = `${import.meta.env.BASE_URL}points.json`.replace(/\/{2,}/g, "/");
		const res = await fetch(url, { cache: "no-cache" });
		if (!res.ok) return null;
		return (await res.json()) as PointsResult;
	} catch {
		return null;
	}
}

export function entryOf(result: PointsResult, address: string | null): AddressPoints | null {
	if (!address) return null;
	const a = address.toLowerCase();
	return result.leaderboard.find((e) => e.address.toLowerCase() === a) ?? null;
}

export const fmtPoints = (p: number): string =>
	p >= 1000 ? Math.round(p).toLocaleString("en-US") : p.toFixed(1);
