/**
 * Checks the TonConnect manifest BEFORE publishing.
 *
 * The manifest is the only thing the wallet downloads itself, from its own device.
 * So its breakage shows neither in the build nor in tests: the app
 * opens fine and fails only at wallet-connect time,
 * with an "invalid manifest" message and no details.
 *
 * That's exactly what happened: public/tonconnect-manifest.json was deleted, the build
 * silently fell back to a path that no longer exists, and it was found only
 * on the live site.
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
    // Without the variable the app takes the manifest from its own serving —
    // so the file must be in public/, otherwise it's a 404.
    console.log('manifest taken from public/ (VITE_TONCONNECT_MANIFEST_URL not set)');
    check('public/tonconnect-manifest.json exists', existsSync(localFile));
    if (existsSync(localFile)) {
        const m = JSON.parse(readFileSync(localFile, 'utf8'));
        check('has url', typeof m.url === 'string' && m.url.startsWith('https://'), `-> ${m.url}`);
        check('has name', typeof m.name === 'string' && m.name.length > 0);
        check('has iconUrl', typeof m.iconUrl === 'string' && m.iconUrl.startsWith('https://'));
    }
} else {
    console.log(`manifest via link: ${envUrl}`);
    check('link is https', envUrl.startsWith('https://'));

    const res = await fetch(envUrl).catch((e) => ({ ok: false, status: String(e.message) }));
    check('downloads', res.ok === true, `-> HTTP ${res.status}`);

    if (res.ok) {
        const text = await res.text();
        let m;
        try {
            m = JSON.parse(text);
        } catch {
            check('is valid JSON', false, `-> ${text.slice(0, 60)}`);
        }
        if (m) {
            check('has url', typeof m.url === 'string' && m.url.startsWith('https://'), `-> ${m.url}`);
            check('has name', typeof m.name === 'string' && m.name.length > 0);
            check('has iconUrl', typeof m.iconUrl === 'string' && m.iconUrl.startsWith('https://'));

            // the manifest url must point at the site itself: the wallet uses it
            // to verify who's requesting the connection.
            const origin = process.env.PAGES_ORIGIN;
            if (origin && m.url) {
                check(
                    `url points to ${origin}`,
                    m.url.startsWith(origin),
                    `-> ${m.url}`,
                );
            }

            if (m.iconUrl) {
                const icon = await fetch(m.iconUrl, { method: 'HEAD' }).catch(() => ({ ok: false }));
                check('icon is reachable', icon.ok === true);
            }
        }
    }
}

console.log(failed === 0 ? '\nmanifest is fine' : `\nproblems: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
