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

// --- разрядность актива ---------------------------------------------------
//
// Самое опасное место интерфейса. У tsTON девять знаков, у tsUSDe шесть, и
// применённая не к тому активу разрядность не даёт ни ошибки, ни отказа —
// сумма просто оказывается в тысячу раз не той. Причём в parseAmount это
// деньги пользователя: введённая «1» ушла бы как тысяча токенов.
console.log('\nразрядность актива');
{
    check('ввод разбирается по мерке пула', parseAmount('1', 6n) === 1_000_000n);
    check('девятка осталась девяткой', parseAmount('1', 9n) === 1_000_000_000n);
    check('дробное тоже', parseAmount('1.5', 6n) === 1_500_000n);
    check(
        'седьмой знак у шестизначного актива отвергается',
        parseAmount('0.0000001', 6n) === null && parseAmount('0.0000001', 9n) === 100n,
    );
    check('показ считает по активу', fmtAmount(1_000_000n, 2, 6n) === '1');
    check(
        'та же сумма при девяти знаках — это ноль целых',
        fmtAmount(1_000_000n, 2, 9n) === '0',
    );
    check(
        'разбор и показ сходятся обратно при обеих разрядностях',
        [6n, 9n].every((d) => fmtAmount(parseAmount('12.34', d)!, 2, d) === '12.34'),
    );
}

// --- реестр пулов ---------------------------------------------------------
//
// Пулов на TON теперь несколько, и у каждого свои адреса, разрядность и
// мандат. Перепутанный набор выглядел бы как работающий интерфейс с чужими
// числами, поэтому проверяем связность каждого.
console.log('\nреестр пулов');
{
    const { POOLS, findPool, poolsOfChain } = await import('./src/lib/pools.ts');

    check('пулы вообще есть', POOLS.length > 0);
    check(
        'идентификаторы не повторяются',
        new Set(POOLS.map((p) => p.id)).size === POOLS.length,
    );
    check(
        'у каждого пула положительная разрядность',
        POOLS.every((p) => p.decimals > 0),
    );
    // Целым токеном минимум быть не обязан: на Solana это 0.001. Но он
    // обязан лежать вокруг одного токена — перепутанная разрядность сдвигает
    // его на три знака и сразу выкидывает за эти границы.
    check(
        'минимальный взнос соразмерен своему активу',
        POOLS.every((p) => {
            const one = 10n ** BigInt(p.decimals);
            return p.minDeposit >= one / 1000n && p.minDeposit <= one * 10n;
        }),
    );
    check(
        'развёрнутым считается только пул с адресом хранилища',
        POOLS.every((p) => !p.deployed || Boolean(p.vault)),
    );
    check(
        'курс к GRAM есть только там, где он существует',
        POOLS.every((p) => !p.ratePool || p.asset === 'tsTON'),
    );
    check('у каждой сети есть хотя бы один пул', poolsOfChain('ton').length > 0 && poolsOfChain('solana').length > 0);
    check('забытый выбор пула не роняет приложение', findPool('нет-такого') === undefined);

    // Экономика у сетей разная, и это не косметика: у "fee" senior ПЛАТИТ
    // за защиту, у "coupon" — ПОЛУЧАЕТ фиксированную ставку. Знак
    // противоположный, и подмена одной формы другой показала бы расход как
    // доход.
    const coupon = POOLS.filter((p) => p.kind === 'coupon');
    const fee = POOLS.filter((p) => p.kind === 'fee');
    check('купонные пулы объявляют свои ставки', coupon.every(
        (p) => (p.mandate.seniorRateBps ?? 0) > 0 && (p.mandate.mezzRateBps ?? 0) > 0,
    ));
    check('и не объявляют платы за защиту', coupon.every(
        (p) => p.mandate.seniorFeeBps === 0 && p.mandate.mezzFeeBps === 0,
    ));
    check('пулы с платой не объявляют купонов', fee.every(
        (p) => p.mandate.seniorRateBps === undefined && p.mandate.mezzRateBps === undefined,
    ));
    // У купонного пула потолка убытка нет: доли выводятся из стоимости пула
    // заново. Ненулевой потолок означал бы обещание предела, которого нет.
    check('у купонных пулов нет потолка убытка', coupon.every(
        (p) => p.mandate.maxLossBps === 0,
    ));
    check('у пулов с платой потолок задан', fee.every((p) => p.mandate.maxLossBps > 0));

    // Токены долей: без них позиция остаётся записью, а её нельзя ни
    // продать, ни увидеть в кошельке. Адреса обязаны быть разными — один
    // и тот же токен на двух траншах смешал бы риски молча.
    const tokenised = POOLS.filter((p) => p.trancheMasters.length > 0);
    check('у токенизированных пулов ровно три токена', tokenised.every(
        (p) => p.trancheMasters.length === 3,
    ));
    check('адреса токенов не повторяются', tokenised.every(
        (p) => new Set(p.trancheMasters.map((a) => a.toLowerCase())).size === 3,
    ));
    // Registry есть не везде: на HyperEVM убыток наблюдается, а не
    // объявляется, и объявлять его некому. Интерфейс обязан это пережить.
    check('пул без registry — законное состояние', POOLS.every(
        (p) => p.registry === null || p.registry.length > 0,
    ));

    // Список кошельков EVM не должен оказываться пустым: раньше человек без
    // расширения видел строку «No EVM wallet found» и упирался в тупик.
    // Теперь даже при нулевом обнаружении остаются предложения поставить.
    const { SUGGESTED } = await import('./src/lib/evmWallets.ts');
    check('есть что предложить, если ничего не установлено', SUGGESTED.length >= 3);
    check('у каждого предложения есть ссылка', SUGGESTED.every(
        (w) => w.url.startsWith('https://'),
    ));
    check('Phantom не предлагается для HyperEVM', !SUGGESTED.some(
        (w) => w.name.toLowerCase().includes('phantom'),
    ));
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
