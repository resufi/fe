import { DECIMALS } from './units.ts';

const ONE = 10n ** DECIMALS;

/** Целочисленные единицы -> читаемая строка. Без плавающей точки в расчётах. */
export function fmtAmount(units: bigint, maxFractionDigits = 2): string {
    const negative = units < 0n;
    const abs = negative ? -units : units;
    const whole = abs / ONE;
    const frac = abs % ONE;

    let fracStr = frac.toString().padStart(Number(DECIMALS), '0').slice(0, maxFractionDigits);
    fracStr = fracStr.replace(/0+$/, '');

    // Тонкий пробел U+2009 — типографски верный разделитель разрядов.
    // Записан escape-последовательностью: невидимый символ в исходнике
    // рано или поздно кто-нибудь заменит на обычный пробел не глядя.
    const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
    const body = fracStr ? `${wholeStr},${fracStr}` : wholeStr;
    return negative ? `−${body}` : body;
}

/** Читаемая строка -> целочисленные единицы. Возвращает null при мусоре. */
export function parseAmount(input: string): bigint | null {
    const cleaned = input.trim().replace(/\s/g, '').replace(',', '.');
    if (!cleaned || !/^\d*\.?\d*$/.test(cleaned)) return null;

    const [whole = '0', frac = ''] = cleaned.split('.');
    if (frac.length > Number(DECIMALS)) return null;

    const units = BigInt(whole || '0') * ONE + BigInt((frac || '0').padEnd(Number(DECIMALS), '0'));
    return units > 0n ? units : null;
}

export function fmtBps(bps: number): string {
    const pct = bps / 100;
    return `${pct.toString().replace('.', ',')}%`;
}

export function fmtDuration(seconds: number): string {
    const days = Math.round(seconds / 86400);
    if (days >= 1) {
        const mod10 = days % 10;
        const mod100 = days % 100;
        if (mod10 === 1 && mod100 !== 11) return `${days} день`;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${days} дня`;
        return `${days} дней`;
    }
    return `${Math.round(seconds / 3600)} ч`;
}

export function shortAddress(a: string): string {
    return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Цена доли в единицах актива, с четырьмя знаками. */
export function sharePrice(totalAssets: bigint, totalShares: bigint): string {
    if (totalShares === 0n) return '1,0000';
    const scaled = (totalAssets * 10000n) / totalShares;
    const whole = scaled / 10000n;
    const frac = (scaled % 10000n).toString().padStart(4, '0');
    return `${whole},${frac}`;
}
