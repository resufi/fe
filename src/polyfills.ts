
import { Buffer } from 'buffer';

declare global {
    // eslint-disable-next-line no-var
    var Buffer: typeof import('buffer').Buffer;
}

const g = globalThis as unknown as Record<string, unknown>;

if (typeof g.Buffer === 'undefined') {
    g.Buffer = Buffer;
}
if (typeof g.global === 'undefined') {
    g.global = globalThis;
}
if (typeof g.process === 'undefined') {
    g.process = { env: {} };
}

export {};
