import type { Mandate } from "./config.ts";
import devnet from "../deployments/solana-devnet.json" with { type: "json" };
import mainnet from "../deployments/solana-mainnet.json" with { type: "json" };
import { env } from "./env.ts";

/**
 * Чтение состояния пула на Solana.
 *
 * Аккаунт разбирается вручную, без @coral-xyz/anchor: клиент Anchor тянет
 * за собой около мегабайта зависимостей, а нам нужно прочитать одну
 * структуру фиксированной раскладки. Раскладка задана в programs/resu-vault/
 * src/state.rs — при её изменении править здесь.
 */
export type SolanaDeployment = {
	network: string;
	programId: string | null;
	vault: string | null;
	registry: string | null;
	assetMint: string | null;
	assetVault: string | null;
	trancheMints: string[];
	mandate: Mandate;
};

const NETWORK = (env("VITE_SOLANA_NETWORK") ?? "devnet") as
	| "devnet"
	| "mainnet";

export const solanaDeployment = (NETWORK === "mainnet"
	? mainnet
	: devnet) as unknown as SolanaDeployment;

export const solanaDeployed = Boolean(solanaDeployment.vault);

const RPC: Record<string, string> = {
	devnet: "https://api.devnet.solana.com",
	mainnet: "https://api.mainnet-beta.solana.com",
};

const endpoint = () =>
	env("VITE_SOLANA_RPC") ??
	RPC[solanaDeployment.network] ??
	RPC.devnet;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
	const res = await fetch(endpoint(), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
	});
	const body = await res.json();
	if (body.error) throw new Error(body.error.message ?? "RPC error");
	return body.result as T;
}

export type SolanaTranche = { totalAssets: bigint; totalShares: bigint };

export type SolanaVaultState = {
	tranches: SolanaTranche[];
	principalDeposited: bigint;
	cumulativeLoss: bigint;
	mandate: Mandate;
	lastAccrualAt: number;
};

/**
 * Курсор по буферу аккаунта.
 *
 * Порядок чтения обязан совпадать с порядком полей в структуре Vault:
 * Borsh пишет их подряд, без имён, и перепутанный порядок даст не ошибку,
 * а правдоподобные неверные числа.
 */
function reader(buf: Uint8Array) {
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	let o = 8; // дискриминатор аккаунта
	return {
		skipPubkey: (n = 1) => {
			o += 32 * n;
		},
		u16: () => {
			const v = view.getUint16(o, true);
			o += 2;
			return v;
		},
		u64: () => {
			const v = view.getBigUint64(o, true);
			o += 8;
			return v;
		},
		i64: () => {
			const v = view.getBigInt64(o, true);
			o += 8;
			return v;
		},
	};
}

export async function readSolanaVault(): Promise<SolanaVaultState> {
	const vault = solanaDeployment.vault;
	if (!vault) throw new Error("Solana vault is not deployed");

	const res = await rpc<{ value: { data: [string, string] } | null }>(
		"getAccountInfo",
		[vault, { encoding: "base64" }],
	);
	if (!res.value) throw new Error("Vault account not found");

	const raw = Uint8Array.from(atob(res.value.data[0]), (c) => c.charCodeAt(0));
	const r = reader(raw);

	r.skipPubkey(3); // asset_mint, asset_vault, registry
	r.skipPubkey(3); // tranche_mints

	const mandate: Mandate = {
		maxLossBps: r.u16(),
		withdrawDelay: Number(r.i64()),
		seniorFeeBps: r.u16(),
		seniorFeeToMezzBps: r.u16(),
		mezzFeeBps: r.u16(),
	};

	const tranches = [0, 1, 2].map(() => ({
		totalAssets: r.u64(),
		totalShares: r.u64(),
	}));

	return {
		tranches,
		principalDeposited: r.u64(),
		cumulativeLoss: r.u64(),
		lastAccrualAt: Number(r.i64()),
		mandate,
	};
}

/**
 * Данные кошелька: баланс базового актива, доли по траншам и незакрытые
 * заявки на выход.
 *
 * Адреса счетов выводятся из владельца, поэтому запрашиваются пачкой одним
 * вызовом: на публичном RPC каждый лишний запрос — это лишняя задержка.
 */
export async function readSolanaWallet(
    owner: string,
    tranches: SolanaTranche[],
): Promise<WalletData> {
    const { PublicKey } = await import("@solana/web3.js");
    const { assetAccount, shareAccount, ticketAddress } = await import("./solanaTx");
    const key = new PublicKey(owner);

    const assetAta = assetAccount(key);
    const shareAtas = [0, 1, 2].map((t) => shareAccount(key, t));
    const tickets = [0, 1, 2].map((t) => ticketAddress(key, t));

    const infos = await rpc<{ value: (AccountInfo | null)[] }>("getMultipleAccounts", [
        [assetAta, ...shareAtas, ...tickets].map((a) => a.toBase58()),
        { encoding: "base64" },
    ]);
    const [assetInfo, ...rest] = infos.value;
    const shareInfos = rest.slice(0, 3);
    const ticketInfos = rest.slice(3, 6);

    const positions: SolanaPosition[] = [];
    for (const id of [0, 1, 2]) {
        const shares = tokenAmount(shareInfos[id]);
        const t = parseTicket(ticketInfos[id]);
        const pending = t?.pendingShares ?? 0n;
        if (shares === 0n && pending === 0n) continue;

        const tr = tranches[id];
        const total = shares + pending;
        positions.push({
            trancheId: id,
            shares,
            pendingShares: pending,
            unlockAt: t?.unlockAt ?? 0,
            valueNow:
                tr.totalShares === 0n ? 0n : (total * tr.totalAssets) / tr.totalShares,
        });
    }

    return { balance: tokenAmount(assetInfo), positions };
}

type AccountInfo = { data: [string, string] };

export type SolanaPosition = {
    trancheId: number;
    shares: bigint;
    pendingShares: bigint;
    unlockAt: number;
    valueNow: bigint;
};

export type WalletData = { balance: bigint; positions: SolanaPosition[] };

const decode = (info: AccountInfo | null): Uint8Array | null =>
    info ? Uint8Array.from(atob(info.data[0]), (c) => c.charCodeAt(0)) : null;

/** Баланс SPL-счёта лежит по фиксированному смещению 64. */
function tokenAmount(info: AccountInfo | null): bigint {
    const raw = decode(info);
    if (!raw || raw.length < 72) return 0n;
    return new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getBigUint64(64, true);
}

/** Заявки может не быть вовсе — она появляется только после сжигания долей. */
function parseTicket(
    info: AccountInfo | null,
): { pendingShares: bigint; unlockAt: number } | null {
    const raw = decode(info);
    if (!raw) return null;
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    // 8 дискриминатор + vault(32) + owner(32) + tranche_id(1)
    let o = 8 + 32 + 32 + 1;
    const pendingShares = view.getBigUint64(o, true);
    o += 8;
    const unlockAt = Number(view.getBigInt64(o, true));
    return { pendingShares, unlockAt };
}

/** Баланс токен-аккаунта. Возвращает 0, если аккаунта нет — это норма. */
export async function readTokenBalance(address: string): Promise<bigint> {
	try {
		const res = await rpc<{ value: { amount: string } }>(
			"getTokenAccountBalance",
			[address],
		);
		return BigInt(res.value.amount);
	} catch {
		return 0n;
	}
}
