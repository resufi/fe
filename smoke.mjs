/**
 * Дымовой тест в браузероподобной среде.
 *
 * Нужен потому, что selftest.ts гоняется в Node, где есть Buffer, process и
 * global. Приложение падало в браузере на первом же импорте @ton/core, а все
 * проверки при этом были зелёными. Здесь среда специально лишена нодовских
 * глобалей — ровно так, как в браузере.
 */
import { readFileSync } from 'fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const bundle = readFileSync(new URL('./dist-smoke/smoke.js', import.meta.url), 'utf8');

const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => errors.push(e.message + (e.detail ? `\n${e.detail}` : '')));
virtualConsole.on('error', (...a) => errors.push(a.join(' ')));

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/',
    virtualConsole,
});

const { window } = dom;

// В настоящем браузере это есть, в jsdom — нет. Всё остальное намеренно
// НЕ подставляем: нодовские глобали должны отсутствовать, в этом весь смысл.
window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
});
window.scrollTo ??= () => {};

if (typeof window.Buffer !== 'undefined') {
    console.log('  ВНИМАНИЕ: Buffer просочился в окружение — тест не доказателен');
}

const script = window.document.createElement('script');
script.textContent = bundle;
window.document.body.appendChild(script);

await new Promise((r) => setTimeout(r, 1500));

const root = window.document.getElementById('root');
const html = root?.innerHTML ?? '';

let failed = 0;
function check(name, cond, extra = '') {
    console.log(cond ? `  ok   ${name}` : `  FAIL ${name} ${extra}`);
    if (!cond) failed++;
}

console.log('запуск приложения в браузероподобной среде');
check('ни одной необработанной ошибки', errors.length === 0, `\n${errors.join('\n')}`);
check('React отрендерил дерево', html.length > 0);
check('заголовок на месте', html.includes('Стейкинг с понятным лимитом потерь'));
check('кнопка кошелька смонтирована', html.includes('data-tc-connect-button'));
check(
    'без адресов показана инструкция, а не выдуманные данные',
    html.includes('не развёрнут'),
);

if (process.env.SMOKE_DUMP) {
    console.log('\n--- разметка ---\n' + html.slice(0, 1200));
}

dom.window.close();
console.log(failed === 0 ? '\nприложение запускается' : `\nпровалено: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
