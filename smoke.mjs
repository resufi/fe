
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

const loading = html.includes('data-loader');
if (loading) {
    check('на время загрузки страницу закрывает заставка', html.includes('aria-busy="true"'));
} else {
    check('заголовок отрендерен', html.includes('data-lede'));
    check('кнопка кошелька смонтирована', html.includes('data-tc-connect-button'));

    check(
        'переключатель сетей отрисован',
        html.includes('TON') && html.includes('Solana'),
    );

    check(
        'кнопка кошелька есть у обеих сетей',
        html.includes('data-tc-connect-button') || html.includes('Connect Wallet'),
    );
}

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
    const states = {
        'читает состояние': loading,
        'показал ошибку сети с кнопкой повтора': html.includes('Retry'),
        'отрисовал транши': html.includes('data-waterfall'),
    };
    const reached = Object.entries(states).find(([, v]) => v)?.[0];
    check(`приложение дошло до работы с протоколом (${reached ?? 'ни одного состояния'})`, Boolean(reached));
    check('инструкции по деплою нет — протокол развёрнут', !html.includes('not deployed'));
} else {
    check('без адресов показана инструкция, а не выдуманные данные', html.includes('not deployed'));
    check('карточек траншей нет — рисовать нечего', !html.includes('data-waterfall'));
}

if (process.env.SMOKE_PROBE) {
    const t = html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    console.log('  ТЕКСТ:', JSON.stringify(t.slice(0, 400)));
}

if (process.env.SMOKE_DUMP) {
    const text = html
        .replace(/<svg[\s\S]*?<\/svg>/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ');
    console.log('\n--- текст страницы ---\n' + text.slice(0, 900));
}

dom.window.close();
console.log(failed === 0 ? '\nприложение запускается' : `\nпровалено: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
