import { Address, beginCell, toNano } from '@ton/core';

const OP_JETTON_TRANSFER = 0x0f8a7ea5;
const OP_WITHDRAW_REQUEST = 0x52455502;
const OP_WITHDRAW_CLAIM = 0x52455503;

const PAYLOAD_DEPOSIT = 0;

/**
 * Газ, прикладываемый к депозиту.
 *
 * forwardTonAmount критичен: без него кошелёк жетона НЕ пришлёт vault'у
 * уведомление, жетоны просто лягут на его баланс, и долей не будет.
 * Это свойство TEP-74, а не нашего контракта, — поэтому ноль здесь
 * недопустим ни при каких условиях.
 */
export const DEPOSIT_FORWARD_TON = toNano('0.12');
export const DEPOSIT_TOTAL_TON = toNano('0.25');
export const WITHDRAW_REQUEST_TON = toNano('0.05');
export const WITHDRAW_CLAIM_TON = toNano('0.15');

/** Перевод жетонов в vault с указанием транша. Шлётся на СВОЙ кошелёк жетона. */
export function depositMessage(vault: Address, owner: Address, trancheId: number, amount: bigint) {
    const forwardPayload = beginCell()
        .storeUint(PAYLOAD_DEPOSIT, 8)
        .storeUint(trancheId, 8)
        .endCell();

    const body = beginCell()
        .storeUint(OP_JETTON_TRANSFER, 32)
        .storeUint(0, 64)
        .storeCoins(amount)
        .storeAddress(vault)
        .storeAddress(owner) // излишек газа вернётся владельцу
        .storeMaybeRef(null)
        .storeCoins(DEPOSIT_FORWARD_TON)
        .storeUint(1, 1)
        .storeRef(forwardPayload)
        .endCell();

    return body;
}

/** Заявка на выход. Шлётся на контракт позиции. */
export function withdrawRequestMessage(shares: bigint) {
    return beginCell().storeUint(OP_WITHDRAW_REQUEST, 32).storeCoins(shares).endCell();
}

/** Забрать после созревания окна. Шлётся на контракт позиции. */
export function withdrawClaimMessage() {
    return beginCell().storeUint(OP_WITHDRAW_CLAIM, 32).endCell();
}
