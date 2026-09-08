/**
 * Проверка чистой логики фронтенда без браузера.
 *
 * Главное здесь — не форматирование, а то, что сообщение, которое собирает
 * интерфейс, побитово совпадает с тем, что принимают контракты. Ошибка в одном
 * бите Either-флага или в порядке полей означает потерянный депозит.
 */
import { Address, Cell } from '@ton/core';
import { burnMessage, claimMessage, depositMessage, DEPOSIT_FORWARD_TON } from './src/lib/payloads.ts';
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
check('round-trip дробного', parseAmount('12.345') === 12_345000000n);
check('мусор отвергается', parseAmount('abc') === null && parseAmount('') === null);
check('ноль не депозит', parseAmount('0') === null);
check('лишние знаки отвергаются', parseAmount('1.0000000001') === null);

// Разделители разрядов: то, что показали, должно читаться обратно.
check('запятые как разделители разрядов принимаются', parseAmount('1,234.5') === 1234_500000000n);
check('и дают то же, что без них', parseAmount('1,234.5') === parseAmount('1234.5'));
check(
    'двусмысленная запятая отвергается, а не угадывается',
    parseAmount('1,5') === null,
    `"1,5" -> ${parseAmount('1,5')}`,
);
check('вывод читается обратно', parseAmount(fmtAmount(1234567_000000000n)) === 1234567_000000000n);

check(
    'разряды делятся запятой',
    fmtAmount(1234567_000000000n) === '1,234,567',
    `-> "${fmtAmount(1234567_000000000n)}"`,
);
check('вывод дробного', fmtAmount(12_345000000n) === '12.34', `-> "${fmtAmount(12_345000000n)}"`);
check('цена доли 1:1 у пустого транша', sharePrice(0n, 0n) === '1.0000');
check('цена доли после убытка', sharePrice(50n, 100n) === '0.5000');

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
// Выход теперь начинается со СЖИГАНИЯ доли в кошельке жетона транша,
// а не с заявки в контракт позиции: доли стали переводимым жетоном.
const burn = burnMessage(40_000000000n, owner).beginParse();
check('опкод сжигания (TEP-74)', burn.loadUint(32) === 0x595f07bc);
burn.loadUint(64); // queryId
check('доли в сжигании', burn.loadCoins() === 40_000000000n);
check('излишек газа возвращается владельцу', burn.loadAddress().equals(owner));
check('customPayload при сжигании отсутствует', burn.loadMaybeRef() === null);

const claim = claimMessage().beginParse();
check('опкод получения', claim.loadUint(32) === 0x52455553);
check('у получения нет параметров', claim.remainingBits === 0);

console.log('\nсериализация');
check('BOC разбирается обратно', Cell.fromBase64(body.toBoc().toString('base64')).equals(body));

// --- сборка транзакций Solana ------------------------------------------
//
// Порядок аккаунтов обязан совпадать с #[derive(Accounts)] в программе.
// Перепутанный порядок даёт отказ на симуляции — но лучше поймать здесь.
console.log('\nтранзакции Solana');
{
    const { PublicKey } = await import('@solana/web3.js');
    const { buildDeposit, ticketAddress, shareAccount } = await import('./src/lib/solanaTx.ts');
    const { solanaDeployment } = await import('./src/lib/solana.ts');

    const owner = new PublicKey('7mn1vG8eVM7F6sVUhMNkS4Qm1oLAm2nK7b4SDaq7ZmqK');

    // PDA заявки выводится детерминированно — значит воспроизводимо.
    const t1 = ticketAddress(owner, 0).toBase58();
    const t2 = ticketAddress(owner, 0).toBase58();
    check('адрес заявки детерминирован', t1 === t2);
    check(
        'заявки разных траншей различаются',
        ticketAddress(owner, 0).toBase58() !== ticketAddress(owner, 1).toBase58(),
    );
    check(
        'счета долей разных траншей различаются',
        shareAccount(owner, 0).toBase58() !== shareAccount(owner, 2).toBase58(),
    );

    // Дискриминатор Anchor: первые 8 байт sha256("global:deposit").
    const expected = new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode('global:deposit')),
    ).slice(0, 8);

    const tx = await buildDeposit(owner, 1, 5_000_000_000n);
    check('транзакция собрана', tx.length > 0);
    check(
        'дискриминатор deposit на месте',
        [...tx].join(',').includes([...expected].join(',')),
    );
    check('адреса пула подставлены', solanaDeployment.vault !== null);
}

// --- переменные сборки ---------------------------------------------------
//
// Незаполненный секрет в CI приходит пустой строкой, а не отсутствием.
// Если считать её значением, приложение подставит пустой адрес и начнёт
// слать запросы само себе — ровно это и случилось на живом сайте.
console.log('\nпеременные сборки');
{
    const { env } = await import('./src/lib/env.ts');
    const P = globalThis.process.env;

    P.RESU_TEST_EMPTY = '';
    P.RESU_TEST_SPACES = '   ';
    P.RESU_TEST_VALUE = 'https://toncenter.com/api/v2/jsonRPC';
    delete P.RESU_TEST_MISSING;

    check('пустая строка считается незаданной', env('RESU_TEST_EMPTY') === undefined);
    check('пробелы считаются незаданными', env('RESU_TEST_SPACES') === undefined);
    check('отсутствующая переменная — undefined', env('RESU_TEST_MISSING') === undefined);
    check(
        'настоящее значение возвращается как есть',
        env('RESU_TEST_VALUE') === 'https://toncenter.com/api/v2/jsonRPC',
    );
}

console.log(failed === 0 ? '\nвсе проверки пройдены' : `\nпровалено: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
