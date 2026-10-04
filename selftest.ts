/**
 * Pure frontend logic checks, without a browser.
 *
 * The point here isn't formatting but that the message the
 * interface builds is byte-for-byte what the contracts accept. A wrong bit in one
 * Either flag or field order means a lost deposit.
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

console.log('amount formatting');
check('round-trip of an integer', parseAmount('1000') === 1000_000000000n);
check('round-trip of a decimal', parseAmount('12.345') === 12_345000000n);
check('garbage is rejected', parseAmount('abc') === null && parseAmount('') === null);
check('zero is not a deposit', parseAmount('0') === null);
check('extra decimals are rejected', parseAmount('1.0000000001') === null);

// Thousands separators: what's displayed must read back.
check('commas as thousands separators are accepted', parseAmount('1,234.5') === 1234_500000000n);
check('and give the same as without them', parseAmount('1,234.5') === parseAmount('1234.5'));
check(
    'an ambiguous comma is rejected, not guessed',
    parseAmount('1,5') === null,
    `"1,5" -> ${parseAmount('1,5')}`,
);
check('output reads back', parseAmount(fmtAmount(1234567_000000000n)) === 1234567_000000000n);

check(
    'thousands are split by a comma',
    fmtAmount(1234567_000000000n) === '1,234,567',
    `-> "${fmtAmount(1234567_000000000n)}"`,
);
check('decimal output', fmtAmount(12_345000000n) === '12.34', `-> "${fmtAmount(12_345000000n)}"`);
check('share price 1:1 for an empty tranche', sharePrice(0n, 0n) === '1.0000');
check('share price after a loss', sharePrice(50n, 100n) === '0.5000');

console.log('\ndeposit message');
const vault = new Address(0, Buffer.alloc(32, 0x11));
const owner = new Address(0, Buffer.alloc(32, 0x22));
const body = depositMessage(vault, owner, 1, 500_000000000n);

const s = body.beginParse();
check('jetton transfer opcode', s.loadUint(32) === 0x0f8a7ea5);
s.loadUint(64); // queryId
check('amount in place', s.loadCoins() === 500_000000000n);
check('recipient is the vault', s.loadAddress().equals(vault));
check('excess gas returns to the owner', s.loadAddress().equals(owner));
check('customPayload absent', s.loadMaybeRef() === null);
const fwdTon = s.loadCoins();
check('forwardTonAmount is positive', fwdTon === DEPOSIT_FORWARD_TON && fwdTon > 0n);

// This is where it breaks silently: if the Either bit is 0, the contract reads the payload
// from the slice remainder, not from a reference.
check('the Either bit points to a reference', s.loadBit() === true);
const fwd = s.loadRef().beginParse();
check('payload kind = deposit', fwd.loadUint(8) === 0);
check('tranche number', fwd.loadUint(8) === 1);
check('nothing else in the payload', fwd.remainingBits === 0 && fwd.remainingRefs === 0);

console.log('\nexit messages');
// Exit now starts with BURNING the share in the tranche jetton wallet,
// not with a ticket to the position contract: shares are now a transferable jetton.
const burn = burnMessage(40_000000000n, owner).beginParse();
check('burn opcode (TEP-74)', burn.loadUint(32) === 0x595f07bc);
burn.loadUint(64); // queryId
check('shares in the burn', burn.loadCoins() === 40_000000000n);
check('excess gas returns to the owner', burn.loadAddress().equals(owner));
check('customPayload absent in the burn', burn.loadMaybeRef() === null);

const claim = claimMessage().beginParse();
check('claim opcode', claim.loadUint(32) === 0x52455553);
check('claim has no parameters', claim.remainingBits === 0);

console.log('\nserialization');
check('BOC parses back', Cell.fromBase64(body.toBoc().toString('base64')).equals(body));

// --- Solana transaction building ------------------------------------------
//
// Account order must match #[derive(Accounts)] in the program.
// A wrong order fails at simulation — but better to catch it here.
console.log('\nSolana transactions');
{
    const { PublicKey } = await import('@solana/web3.js');
    const { buildDeposit, ticketAddress, shareAccount } = await import('./src/lib/solanaTx.ts');
    const { solanaDeployment } = await import('./src/lib/solana.ts');

    const owner = new PublicKey('7mn1vG8eVM7F6sVUhMNkS4Qm1oLAm2nK7b4SDaq7ZmqK');

    // The ticket PDA is derived deterministically — so reproducibly.
    const t1 = ticketAddress(owner, 0).toBase58();
    const t2 = ticketAddress(owner, 0).toBase58();
    check('ticket address is deterministic', t1 === t2);
    check(
        'tickets of different tranches differ',
        ticketAddress(owner, 0).toBase58() !== ticketAddress(owner, 1).toBase58(),
    );
    check(
        'share accounts of different tranches differ',
        shareAccount(owner, 0).toBase58() !== shareAccount(owner, 2).toBase58(),
    );

    // Anchor discriminator: the first 8 bytes of sha256("global:deposit").
    const expected = new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode('global:deposit')),
    ).slice(0, 8);

    const tx = await buildDeposit(owner, 1, 5_000_000_000n);
    check('transaction built', tx.length > 0);
    check(
        'deposit discriminator in place',
        [...tx].join(',').includes([...expected].join(',')),
    );
    check('pool addresses substituted', solanaDeployment.vault !== null);
}

// --- asset decimals ---------------------------------------------------
//
// The most dangerous spot in the interface. tsTON has nine decimals, tsUSDe six, and
// decimals applied to the wrong asset give neither an error nor a rejection —
// the amount just ends up a thousandfold off. And in parseAmount that's
// the user's money: an entered "1" would go out as a thousand tokens.
console.log('\nasset decimals');
{
    check('input is parsed to the pool\'s scale', parseAmount('1', 6n) === 1_000_000n);
    check('nine stays nine', parseAmount('1', 9n) === 1_000_000_000n);
    check('a decimal too', parseAmount('1.5', 6n) === 1_500_000n);
    check(
        'a seventh decimal on a six-decimal asset is rejected',
        parseAmount('0.0000001', 6n) === null && parseAmount('0.0000001', 9n) === 100n,
    );
    check('display scales by the asset', fmtAmount(1_000_000n, 2, 6n) === '1');
    check(
        'the same amount at nine decimals is zero whole',
        fmtAmount(1_000_000n, 2, 9n) === '0',
    );
    check(
        'parse and display round-trip at both decimal scales',
        [6n, 9n].every((d) => fmtAmount(parseAmount('12.34', d)!, 2, d) === '12.34'),
    );
}

// --- pool registry ---------------------------------------------------------
//
// There are now several pools on TON, each with its own addresses, decimals and
// mandate. A mixed-up set would look like a working interface with the wrong
// numbers, so we check each one's consistency.
console.log('\npool registry');
{
    const { POOLS, findPool, poolsOfChain } = await import('./src/lib/pools.ts');

    check('pools exist at all', POOLS.length > 0);
    check(
        'ids don\'t repeat',
        new Set(POOLS.map((p) => p.id)).size === POOLS.length,
    );
    check(
        'every pool has positive decimals',
        POOLS.every((p) => p.decimals > 0),
    );
    // The minimum need not be a whole token: on Solana it's 0.001. But it
    // must sit around one token — wrong decimals shift
    // it by three digits and immediately throw it out of these bounds.
    check(
        'minimum deposit is commensurate with its asset',
        POOLS.every((p) => {
            // Catches a decimals error (deposit at the wrong scale), but wide
            // enough: for a cheap asset the contract's $10 minimum is hundreds
            // of tokens (aprMON ~$0.04 -> ~300), and that's not an error.
            const one = 10n ** BigInt(p.decimals);
            return p.minDeposit >= one / 1000n && p.minDeposit <= one * 1000n;
        }),
    );
    check(
        'only a pool with a vault address counts as deployed',
        POOLS.every((p) => !p.deployed || Boolean(p.vault)),
    );
    check(
        'a GRAM rate exists only where it actually does',
        POOLS.every((p) => !p.ratePool || p.asset === 'tsTON'),
    );
    check('every chain has at least one pool', poolsOfChain('ton').length > 0 && poolsOfChain('solana').length > 0);
    check('a forgotten pool choice doesn\'t crash the app', findPool('no-such') === undefined);

    // Economics differ per chain, and it's not cosmetic: in "fee" senior PAYS
    // for protection, in "coupon" it EARNS a fixed rate. The sign is
    // opposite, and swapping one for the other would show an expense as
    // income.
    const coupon = POOLS.filter((p) => p.kind === 'coupon');
    const fee = POOLS.filter((p) => p.kind === 'fee');
    check('coupon pools declare their rates', coupon.every(
        (p) => (p.mandate.seniorRateBps ?? 0) > 0 && (p.mandate.mezzRateBps ?? 0) > 0,
    ));
    check('and declare no protection fee', coupon.every(
        (p) => p.mandate.seniorFeeBps === 0 && p.mandate.mezzFeeBps === 0,
    ));
    check('fee pools declare no coupons', fee.every(
        (p) => p.mandate.seniorRateBps === undefined && p.mandate.mezzRateBps === undefined,
    ));
    // A coupon pool has no loss ceiling: shares are re-derived from the pool's value
    // each time. A non-zero ceiling would promise a limit that doesn't exist.
    check('coupon pools have no loss ceiling', coupon.every(
        (p) => p.mandate.maxLossBps === 0,
    ));
    check('fee pools have a ceiling set', fee.every((p) => p.mandate.maxLossBps > 0));

    // Share tokens: without them a position stays a ledger entry, which can be neither
    // sold nor seen in a wallet. The addresses must differ — one
    // and the same token on two tranches would silently mix the risks.
    const tokenised = POOLS.filter((p) => p.trancheMasters.length > 0);
    check('tokenized pools have exactly three tokens', tokenised.every(
        (p) => p.trancheMasters.length === 3,
    ));
    check('token addresses don\'t repeat', tokenised.every(
        (p) => new Set(p.trancheMasters.map((a) => a.toLowerCase())).size === 3,
    ));
    // Not every chain has a Registry: on HyperEVM loss is observed, not
    // declared, and there's no one to declare it. The interface must survive that.
    check('a pool with no registry is a valid state', POOLS.every(
        (p) => p.registry === null || p.registry.length > 0,
    ));

    // The EVM wallet list must not end up empty: a person without an
    // extension used to see "No EVM wallet found" and hit a dead end.
    // Now even with zero discovery there are install suggestions.
    const { SUGGESTED } = await import('./src/lib/evmWallets.ts');
    check('there\'s something to suggest if nothing is installed', SUGGESTED.length >= 3);
    check('every suggestion has a link', SUGGESTED.every(
        (w) => w.url.startsWith('https://'),
    ));
    check('Phantom is not suggested for HyperEVM', !SUGGESTED.some(
        (w) => w.name.toLowerCase().includes('phantom'),
    ));
}

// --- build variables ---------------------------------------------------
//
// An unfilled secret in CI arrives as an empty string, not as absence.
// Treating it as a value makes the app substitute an empty address and start
// sending requests to itself — exactly what happened on the live site.
console.log('\nbuild variables');
{
    const { env } = await import('./src/lib/env.ts');
    const P = globalThis.process.env;

    P.RESU_TEST_EMPTY = '';
    P.RESU_TEST_SPACES = '   ';
    P.RESU_TEST_VALUE = 'https://toncenter.com/api/v2/jsonRPC';
    delete P.RESU_TEST_MISSING;

    check('an empty string counts as unset', env('RESU_TEST_EMPTY') === undefined);
    check('whitespace counts as unset', env('RESU_TEST_SPACES') === undefined);
    check('a missing variable is undefined', env('RESU_TEST_MISSING') === undefined);
    check(
        'a real value is returned as-is',
        env('RESU_TEST_VALUE') === 'https://toncenter.com/api/v2/jsonRPC',
    );
}

console.log(failed === 0 ? '\nall checks passed' : `\nfailed: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
