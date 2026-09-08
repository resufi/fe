import {
	Connection,
	PublicKey,
	Transaction,
	SystemProgram,
} from "@solana/web3.js";
import {
	TOKEN_PROGRAM_ID,
	ASSOCIATED_TOKEN_PROGRAM_ID,
	getAssociatedTokenAddressSync,
	createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { solanaDeployment } from "./solana.ts";
import { env } from "./env.ts";

/**
 * Сборка транзакций для программы пула.
 *
 * Инструкции собираются вручную, без клиента Anchor: он тянет за собой
 * заметный объём ради вещей, которые здесь сводятся к одному дискриминатору
 * и нескольким аккаунтам в фиксированном порядке.
 *
 * Порядок аккаунтов обязан совпадать с #[derive(Accounts)] в программе —
 * перепутанный даст отказ на симуляции, а не тихую ошибку.
 */

const RPC: Record<string, string> = {
	devnet: "https://api.devnet.solana.com",
	mainnet: "https://api.mainnet-beta.solana.com",
};

export const connection = () =>
	new Connection(
		env("VITE_SOLANA_RPC") ??
			RPC[solanaDeployment.network] ??
			RPC.devnet,
		"confirmed",
	);

/**
 * Дискриминатор инструкции Anchor: первые 8 байт от sha256("global:<имя>").
 * Считается один раз при сборке транзакции.
 */
async function discriminator(name: string): Promise<Uint8Array> {
	const data = new TextEncoder().encode(`global:${name}`);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return new Uint8Array(hash).slice(0, 8);
}

const u64 = (v: bigint): Uint8Array => {
	const b = new Uint8Array(8);
	new DataView(b.buffer).setBigUint64(0, v, true);
	return b;
};

const key = (s: string) => new PublicKey(s);

const pda = (seeds: (Buffer | Uint8Array)[]) =>
	PublicKey.findProgramAddressSync(seeds, key(solanaDeployment.programId!))[0];

export const trancheMint = (id: number) => key(solanaDeployment.trancheMints[id]);

/** Адрес заявки на выход: выводится из владельца и транша. */
export const ticketAddress = (owner: PublicKey, trancheId: number) =>
	pda([
		Buffer.from("ticket"),
		key(solanaDeployment.vault!).toBuffer(),
		owner.toBuffer(),
		Buffer.from([trancheId]),
	]);

export const assetAccount = (owner: PublicKey) =>
	getAssociatedTokenAddressSync(key(solanaDeployment.assetMint!), owner);

export const shareAccount = (owner: PublicKey, trancheId: number) =>
	getAssociatedTokenAddressSync(trancheMint(trancheId), owner);

/** Создаёт связанный счёт, если его ещё нет. Иначе депозит некуда зачислить. */
async function ensureAccount(
	conn: Connection,
	tx: Transaction,
	owner: PublicKey,
	mint: PublicKey,
	address: PublicKey,
): Promise<void> {
	if (await conn.getAccountInfo(address)) return;
	tx.add(
		createAssociatedTokenAccountInstruction(owner, address, owner, mint),
	);
}

async function finalize(
	conn: Connection,
	tx: Transaction,
	payer: PublicKey,
): Promise<Uint8Array> {
	tx.feePayer = payer;
	tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
	// Подписи ещё нет — её поставит кошелёк.
	return tx.serialize({ requireAllSignatures: false, verifySignatures: false });
}

export async function buildDeposit(
	owner: PublicKey,
	trancheId: number,
	amount: bigint,
): Promise<Uint8Array> {
	const conn = connection();
	const d = solanaDeployment;
	const tx = new Transaction();

	const shares = shareAccount(owner, trancheId);
	await ensureAccount(conn, tx, owner, trancheMint(trancheId), shares);

	const data = new Uint8Array([
		...(await discriminator("deposit")),
		trancheId,
		...u64(amount),
	]);

	tx.add({
		programId: key(d.programId!),
		keys: [
			{ pubkey: key(d.vault!), isSigner: false, isWritable: true },
			{ pubkey: key(d.assetMint!), isSigner: false, isWritable: false },
			{ pubkey: key(d.assetVault!), isSigner: false, isWritable: true },
			{ pubkey: trancheMint(trancheId), isSigner: false, isWritable: true },
			{ pubkey: owner, isSigner: true, isWritable: true },
			{ pubkey: assetAccount(owner), isSigner: false, isWritable: true },
			{ pubkey: shares, isSigner: false, isWritable: true },
			{ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
		],
		data: Buffer.from(data),
	});

	return finalize(conn, tx, owner);
}

export async function buildRequestWithdrawal(
	owner: PublicKey,
	trancheId: number,
	shares: bigint,
): Promise<Uint8Array> {
	const conn = connection();
	const d = solanaDeployment;
	const tx = new Transaction();

	const data = new Uint8Array([
		...(await discriminator("request_withdrawal")),
		trancheId,
		...u64(shares),
	]);

	tx.add({
		programId: key(d.programId!),
		keys: [
			{ pubkey: key(d.vault!), isSigner: false, isWritable: true },
			{ pubkey: trancheMint(trancheId), isSigner: false, isWritable: true },
			{ pubkey: owner, isSigner: true, isWritable: true },
			{ pubkey: shareAccount(owner, trancheId), isSigner: false, isWritable: true },
			{ pubkey: ticketAddress(owner, trancheId), isSigner: false, isWritable: true },
			{ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
			{ pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
		],
		data: Buffer.from(data),
	});

	return finalize(conn, tx, owner);
}

export async function buildClaim(
	owner: PublicKey,
	trancheId: number,
): Promise<Uint8Array> {
	const conn = connection();
	const d = solanaDeployment;
	const tx = new Transaction();

	const asset = assetAccount(owner);
	await ensureAccount(conn, tx, owner, key(d.assetMint!), asset);

	tx.add({
		programId: key(d.programId!),
		keys: [
			{ pubkey: key(d.vault!), isSigner: false, isWritable: true },
			{ pubkey: key(d.assetMint!), isSigner: false, isWritable: false },
			{ pubkey: key(d.assetVault!), isSigner: false, isWritable: true },
			{ pubkey: owner, isSigner: true, isWritable: true },
			{ pubkey: asset, isSigner: false, isWritable: true },
			{ pubkey: ticketAddress(owner, trancheId), isSigner: false, isWritable: true },
			{ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
		],
		data: Buffer.from(await discriminator("claim")),
	});

	return finalize(conn, tx, owner);
}

export { ASSOCIATED_TOKEN_PROGRAM_ID };
