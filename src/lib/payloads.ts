import { Address, beginCell, toNano } from "@ton/core";

const OP_JETTON_TRANSFER = 0x0f8a7ea5;
const OP_JETTON_BURN = 0x595f07bc;
const OP_TICKET_CLAIM = 0x52455553;

const PAYLOAD_DEPOSIT = 0;

export const DEPOSIT_FORWARD_TON = toNano("0.12");
export const DEPOSIT_TOTAL_TON = toNano("0.25");

export const BURN_TON = toNano("0.2");
export const CLAIM_TON = toNano("0.15");

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

export function burnMessage(shares: bigint, responseTo: Address) {
	return beginCell()
		.storeUint(OP_JETTON_BURN, 32)
		.storeUint(0, 64)
		.storeCoins(shares)
		.storeAddress(responseTo)
		.storeMaybeRef(null)
		.endCell();
}

export function claimMessage() {
	return beginCell().storeUint(OP_TICKET_CLAIM, 32).endCell();
}
