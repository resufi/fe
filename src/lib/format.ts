import { DECIMALS } from './units.ts';

const ONE = 10n ** DECIMALS;

export function fmtAmount(units: bigint, maxFractionDigits = 2): string {
    const negative = units < 0n;
    const abs = negative ? -units : units;
    const whole = abs / ONE;
    const frac = abs % ONE;

    let fracStr = frac.toString().padStart(Number(DECIMALS), '0').slice(0, maxFractionDigits);
    fracStr = fracStr.replace(/0+$/, '');

    const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const body = fracStr ? `${wholeStr}.${fracStr}` : wholeStr;

    return negative ? `−${body}` : body;
}

export function parseAmount(input: string): bigint | null {
    const cleaned = input.trim().replace(/\s/g, '');
    if (!cleaned) return null;

    let normalised: string;
    if (/^\d{1,3}(,\d{3})*(\.\d*)?$/.test(cleaned)) {
        normalised = cleaned.replace(/,/g, '');
    } else if (/^\d*\.?\d*$/.test(cleaned)) {
        normalised = cleaned;
    } else {
        return null;
    }

    const [whole = '0', frac = ''] = normalised.split('.');
    if (frac.length > Number(DECIMALS)) return null;

    const units = BigInt(whole || '0') * ONE + BigInt((frac || '0').padEnd(Number(DECIMALS), '0'));
    return units > 0n ? units : null;
}

export function fmtBps(bps: number): string {
    return `${bps / 100}%`;
}

export function fmtDuration(seconds: number): string {
    const days = Math.round(seconds / 86400);
    if (days >= 1) return days === 1 ? '1 day' : `${days} days`;
    const hours = Math.round(seconds / 3600);
    return hours === 1 ? '1 hour' : `${hours} hours`;
}

export function shortAddress(a: string): string {
    return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export function toGram(units: bigint, rate: number): bigint {
    return (units * BigInt(Math.round(rate * 1e6))) / 1_000_000n;
}

export function sharePrice(totalAssets: bigint, totalShares: bigint): string {
    if (totalShares === 0n) return '1.0000';
    const scaled = (totalAssets * 10000n) / totalShares;
    return `${scaled / 10000n}.${(scaled % 10000n).toString().padStart(4, '0')}`;
}
