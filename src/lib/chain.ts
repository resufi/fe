import { getHttpEndpoint } from '@orbs-network/ton-access';
import { Address, TonClient, TupleBuilder } from '@ton/ton';
import { deployment } from './config';

let clientPromise: Promise<TonClient> | null = null;

export function getClient(): Promise<TonClient> {
    if (!clientPromise) {
        clientPromise = getHttpEndpoint({ network: deployment.network }).then(
            (endpoint) => new TonClient({ endpoint }),
        );
    }
    return clientPromise;
}

async function call(address: Address, method: string, args: (bigint | Address)[] = []) {
    const client = await getClient();
    const b = new TupleBuilder();
    for (const a of args) {
        if (typeof a === 'bigint') b.writeNumber(a);
        else b.writeAddress(a);
    }
    return client.runMethod(address, method, b.build());
}

export type TrancheState = { totalAssets: bigint; totalShares: bigint };

export async function readTranche(vault: Address, trancheId: number): Promise<TrancheState> {
    const res = await call(vault, 'trancheState', [BigInt(trancheId)]);
    return { totalAssets: res.stack.readBigNumber(), totalShares: res.stack.readBigNumber() };
}

export type VaultState = {
    principalDeposited: bigint;
    cumulativeLoss: bigint;
    maxLossBps: number;
    withdrawDelay: number;
};

export async function readVaultState(vault: Address): Promise<VaultState> {
    const res = await call(vault, 'vaultState');
    return {
        principalDeposited: res.stack.readBigNumber(),
        cumulativeLoss: res.stack.readBigNumber(),
        maxLossBps: res.stack.readNumber(),
        withdrawDelay: res.stack.readNumber(),
    };
}

export async function readHeadroom(vault: Address): Promise<bigint> {
    const res = await call(vault, 'lossHeadroomNow');
    return res.stack.readBigNumber();
}

export async function readPositionAddress(vault: Address, owner: Address, trancheId: number): Promise<Address> {
    const res = await call(vault, 'positionAddress', [owner, BigInt(trancheId)]);
    return res.stack.readAddress();
}

export type PositionState = {
    shares: bigint;
    lockedShares: bigint;
    unlockAt: number;
};

/** Позиции может не быть вовсе — это норма, а не ошибка. */
export async function readPosition(position: Address): Promise<PositionState | null> {
    const client = await getClient();
    const state = await client.getContractState(position);
    if (state.state !== 'active') return null;

    const res = await call(position, 'positionData');
    res.stack.readAddress(); // vault
    res.stack.readAddress(); // owner
    res.stack.readNumber(); // trancheId
    return {
        shares: res.stack.readBigNumber(),
        lockedShares: res.stack.readBigNumber(),
        unlockAt: res.stack.readNumber(),
    };
}

/** Адрес кошелька жетона, который мастер выдал этому владельцу. */
export async function readJettonWallet(master: Address, owner: Address): Promise<Address> {
    const res = await call(master, 'get_wallet_address', [owner]);
    return res.stack.readAddress();
}

export async function readJettonBalance(wallet: Address): Promise<bigint> {
    const client = await getClient();
    const state = await client.getContractState(wallet);
    if (state.state !== 'active') return 0n;
    const res = await call(wallet, 'get_wallet_data');
    return res.stack.readBigNumber();
}
