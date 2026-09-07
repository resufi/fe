/**
 * Проверяет манифест TonConnect ДО публикации.
 *
 * Манифест — единственное, что кошелёк скачивает сам, со своего устройства.
 * Поэтому его поломка не видна ни в сборке, ни в тестах: приложение
 * открывается нормально и падает только в момент подключения кошелька,
 * сообщением «invalid manifest» без подробностей.
 *
 * Ровно так и вышло: файл public/tonconnect-manifest.json удалили, сборка
 * молча ушла на запасной путь, которого больше нет, и обнаружилось это уже
 * на живом сайте.
 */
import { existsSync, readFileSync } from 'fs';

const envUrl = (() => {
    if (process.env.VITE_TONCONNECT_MANIFEST_URL) return process.env.VITE_TONCONNECT_MANIFEST_URL;
    try {
        const env = readFileSync(new URL('./.env', import.meta.url), 'utf8');
        return env.match(/^\s*VITE_TONCONNECT_MANIFEST_URL\s*=\s*(\S+)/m)?.[1];
    } catch {
        return undefined;
    }
})();

let failed = 0;
const check = (name, ok, extra = '') => {
    console.log(ok ? `  ok   ${name}` : `  FAIL ${name} ${extra}`);
    if (!ok) failed++;
};

const localFile = new URL('./public/tonconnect-manifest.json', import.meta.url);

if (!envUrl) {
    // Без переменной приложение берёт манифест из собственной раздачи —
    // значит файл обязан лежать в public/, иначе будет 404.
    console.log('манифест берётся из public/ (VITE_TONCONNECT_MANIFEST_URL не задан)');
    check('public/tonconnect-manifest.json существует', existsSync(localFile));
    if (existsSync(localFile)) {
        const m = JSON.parse(readFileSync(localFile, 'utf8'));
        check('есть url', typeof m.url === 'string' && m.url.startsWith('https://'), `-> ${m.url}`);
        check('есть name', typeof m.name === 'string' && m.name.length > 0);
        check('есть iconUrl', typeof m.iconUrl === 'string' && m.iconUrl.startsWith('https://'));
    }
} else {
    console.log(`манифест по ссылке: ${envUrl}`);
    check('ссылка https', envUrl.startsWith('https://'));

    const res = await fetch(envUrl).catch((e) => ({ ok: false, status: String(e.message) }));
    check('скачивается', res.ok === true, `-> HTTP ${res.status}`);

    if (res.ok) {
        const text = await res.text();
        let m;
        try {
            m = JSON.parse(text);
        } catch {
            check('это валидный JSON', false, `-> ${text.slice(0, 60)}`);
        }
        if (m) {
            check('есть url', typeof m.url === 'string' && m.url.startsWith('https://'), `-> ${m.url}`);
            check('есть name', typeof m.name === 'string' && m.name.length > 0);
            check('есть iconUrl', typeof m.iconUrl === 'string' && m.iconUrl.startsWith('https://'));

            // url в манифесте обязан указывать на сам сайт: по нему кошелёк
            // сверяет, кто просит подключение.
            const origin = process.env.PAGES_ORIGIN;
            if (origin && m.url) {
                check(
                    `url ведёт на ${origin}`,
                    m.url.startsWith(origin),
                    `-> ${m.url}`,
                );
            }

            if (m.iconUrl) {
                const icon = await fetch(m.iconUrl, { method: 'HEAD' }).catch(() => ({ ok: false }));
                check('иконка доступна', icon.ok === true);
            }
        }
    }
}

console.log(failed === 0 ? '\nманифест в порядке' : `\nпроблем: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
