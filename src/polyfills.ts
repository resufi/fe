/**
 * Нодовские глобали для браузера.
 *
 * @ton/core и @ton/ton написаны под Node и обращаются к глобальному Buffer
 * напрямую, а не импортом. В браузере его нет, и приложение падает на первом
 * же импорте: «Buffer is not defined».
 *
 * Почему это модуль в исходниках, а не плагин сборки: плагин подставляет
 * полифилл только при `vite build`, а в dev-режиме граф модулей остаётся без
 * него — и `npm run dev` продолжает падать, хотя сборка проходит. Модуль
 * попадает в граф одинаково в обоих режимах, поэтому и дымовой тест накрывает
 * оба.
 *
 * ВАЖНО: импортировать первым в main.tsx. Импорты ES-модулей вычисляются в
 * порядке следования, и полифилл должен быть выставлен до того, как начнёт
 * исполняться тело любого модуля, которому Buffer нужен.
 */
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
