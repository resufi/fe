import { Address, beginCell, toNano } from "@ton/core";

const OP_JETTON_TRANSFER = 0x0f8a7ea5;
const OP_WITHDRAW_REQUEST = 0x52455502;
const OP_WITHDRAW_CLAIM = 0x52455503;

const PAYLOAD_DEPOSIT = 0;

export const DEPOSIT_FORWARD_TON = toNano("0.12");
export const DEPOSIT_TOTAL_TON = toNano("0.25");
export const WITHDRAW_REQUEST_TON = toNano("0.05");
export const WITHDRAW_CLAIM_TON = toNano("0.15");

export function depositMessage(
	vault: Address,
	owner: Address,
	trancheId: number,
	amount: bigint,
) {
	const forwardPayload = beginCell()
		.storeUint(PAYLOAD_DEPOSIT, 8)
		.storeUint(trancheId, 8)
		.endCell();

	const body = beginCell()
		.storeUint(OP_JETTON_TRANSFER, 32)
		.storeUint(0, 64)
		.storeCoins(amount)
		.storeAddress(vault)
		.storeAddress(owner)
		.storeMaybeRef(null)
		.storeCoins(DEPOSIT_FORWARD_TON)
		.storeUint(1, 1)
		.storeRef(forwardPayload)
		.endCell();

	return body;
}

export function withdrawRequestMessage(shares: bigint) {
	return beginCell()
		.storeUint(OP_WITHDRAW_REQUEST, 32)
		.storeCoins(shares)
		.endCell();
}

export function withdrawClaimMessage() {
	return beginCell().storeUint(OP_WITHDRAW_CLAIM, 32).endCell();
}
