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
//
// fetch пробрасываем нодовский, а не заглушку: TonConnect скачивает через
// него манифест, и подделка скрыла бы настоящие ошибки загрузки.
window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
});
window.scrollTo ??= () => {};
window.fetch ??= (...args) => fetch(...args);
window.Headers ??= Headers;
window.Request ??= Request;
window.Response ??= Response;

if (typeof window.Buffer !== 'undefined') {
    console.log('  ВНИМАНИЕ: Buffer просочился в окружение — тест не доказателен');
}

const script = window.document.createElement('script');
script.textContent = bundle;
window.document.body.appendChild(script);

// По умолчанию коротко — тест не должен зависеть от живой сети. SMOKE_WAIT
// позволяет дождаться реальных данных, когда нужно посмотреть на результат.
await new Promise((r) => setTimeout(r, Number(process.env.SMOKE_WAIT ?? 1500)));

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
// Проверяем по структуре, а не по тексту: копирайт правится часто, и тест,
// падающий от смены формулировки, только мешает.
check('заголовок отрендерен', html.includes('class="lede"'));
check('кнопка кошелька смонтирована', html.includes('data-tc-connect-button'));
// Что именно должно быть на странице, зависит от того, развёрнут ли протокол
// в выбранной сети. Оба состояния законны, но подменять одно другим нельзя:
// без адресов интерфейс обязан честно сказать об этом, а не рисовать нули.
// Сеть берём оттуда же, откуда её берёт сборка — из .env. Читать
// process.env нельзя: vite подставляет переменные в бандл сам, а в процессе
// node их нет, и тест сверялся бы не с той сетью, что собрана.
function envNetwork() {
    try {
        const env = readFileSync(new URL('./.env', import.meta.url), 'utf8');
        const m = env.match(/^\s*VITE_NETWORK\s*=\s*(\S+)/m);
        return m ? m[1] : 'testnet';
    } catch {
        return 'testnet';
    }
}

const network = envNetwork();
const deployed = JSON.parse(
    readFileSync(new URL(`./src/deployments/${network}.json`, import.meta.url), 'utf8'),
).vault !== null;
console.log(`  (сеть: ${network}, развёрнут: ${deployed ? 'да' : 'нет'})`);

if (deployed) {
    // К моменту снимка приложение может быть в любом из трёх законных
    // состояний — что успеет за отведённое время. Сеть здесь настоящая,
    // поэтому гадать бессмысленно: перечисляем все три и проверяем, что
    // приложение оказалось в одном из них, а не застряло на пустой странице.
    const states = {
        'читает состояние': html.includes('class="muted state"'),
        'показал ошибку сети с кнопкой повтора': html.includes('Retry'),
        'отрисовал транши': html.includes('class="tranches"'),
    };
    const reached = Object.entries(states).find(([, v]) => v)?.[0];
    check(`приложение дошло до работы с протоколом (${reached ?? 'ни одного состояния'})`, Boolean(reached));
    check('инструкции по деплою нет — протокол развёрнут', !html.includes('not deployed'));
} else {
    check('без адресов показана инструкция, а не выдуманные данные', html.includes('not deployed'));
    check('карточек траншей нет — рисовать нечего', !html.includes('class="tranches"'));
}

if (process.env.SMOKE_PROBE) {
    const t = html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    console.log('  ТЕКСТ:', JSON.stringify(t.slice(0, 400)));
}

if (process.env.SMOKE_DUMP) {
    // Без вырезания svg дамп целиком уходит на иконку кошелька.
    const text = html
        .replace(/<svg[\s\S]*?<\/svg>/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ');
    console.log('\n--- текст страницы ---\n' + text.slice(0, 900));
}

dom.window.close();
console.log(failed === 0 ? '\nприложение запускается' : `\nпровалено: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
