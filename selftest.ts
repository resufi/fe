/**
 * Проверка чистой логики фронтенда без браузера.
 *
 * Главное здесь — не форматирование, а то, что сообщение, которое собирает
 * интерфейс, побитово совпадает с тем, что принимают контракты. Ошибка в одном
 * бите Either-флага или в порядке полей означает потерянный депозит.
 */
import { Address, Cell } from '@ton/core';
import { depositMessage, DEPOSIT_FORWARD_TON, withdrawClaimMessage, withdrawRequestMessage } from './src/lib/payloads.ts';
import { fmtAmount, parseAmount, sharePrice } from './src/lib/format.ts';

let failed = 0;
function check(name: string, cond: boolean, extra = '') {
    if (cond) {
        console.log(`  ok   ${name}`);
    } else {
        failed++;
        console.log(`  FAIL ${name} ${extra}`);
    }
}

console.log('форматирование сумм');
check('round-trip целого', parseAmount('1000') === 1000_000000000n);
check('round-trip дробного', parseAmount('12,345') === 12_345000000n);
check('точка и запятая равнозначны', parseAmount('12.345') === parseAmount('12,345'));
check('мусор отвергается', parseAmount('abc') === null && parseAmount('') === null);
check('ноль не депозит', parseAmount('0') === null);
check('лишние знаки отвергаются', parseAmount('1.0000000001') === null);
check(
    'разряды делятся тонким пробелом',
    fmtAmount(1234567_000000000n) === '1\u2009234\u2009567',
    `-> "${fmtAmount(1234567_000000000n)}"`,
);
check('вывод дробного', fmtAmount(12_345000000n) === '12,34');
check('цена доли 1:1 у пустого транша', sharePrice(0n, 0n) === '1,0000');
check('цена доли после убытка', sharePrice(50n, 100n) === '0,5000');

console.log('\nсообщение депозита');
const vault = new Address(0, Buffer.alloc(32, 0x11));
const owner = new Address(0, Buffer.alloc(32, 0x22));
const body = depositMessage(vault, owner, 1, 500_000000000n);

const s = body.beginParse();
check('опкод jetton transfer', s.loadUint(32) === 0x0f8a7ea5);
s.loadUint(64); // queryId
check('сумма на месте', s.loadCoins() === 500_000000000n);
check('получатель — vault', s.loadAddress().equals(vault));
check('излишек газа возвращается владельцу', s.loadAddress().equals(owner));
check('customPayload отсутствует', s.loadMaybeRef() === null);
const fwdTon = s.loadCoins();
check('forwardTonAmount положителен', fwdTon === DEPOSIT_FORWARD_TON && fwdTon > 0n);

// Именно здесь ломается тихо: если Either-бит 0, контракт читает нагрузку
// из остатка слайса, а не из ссылки.
check('Either-бит указывает на ссылку', s.loadBit() === true);
const fwd = s.loadRef().beginParse();
check('вид нагрузки = депозит', fwd.loadUint(8) === 0);
check('номер транша', fwd.loadUint(8) === 1);
check('в нагрузке больше ничего нет', fwd.remainingBits === 0 && fwd.remainingRefs === 0);

console.log('\nсообщения выхода');
const req = withdrawRequestMessage(40_000000000n).beginParse();
check('опкод заявки', req.loadUint(32) === 0x52455502);
check('доли в заявке', req.loadCoins() === 40_000000000n);

const claim = withdrawClaimMessage().beginParse();
check('опкод клейма', claim.loadUint(32) === 0x52455503);
check('у клейма нет параметров', claim.remainingBits === 0);

console.log('\nсериализация');
check('BOC разбирается обратно', Cell.fromBase64(body.toBoc().toString('base64')).equals(body));

console.log(failed === 0 ? '\nвсе проверки пройдены' : `\nпровалено: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
