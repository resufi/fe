/**
 * Reconciles build variables: what the code reads vs what the
 * publish workflow passes.
 *
 * A missing variable isn't a build error. The app builds,
 * publishes and silently falls back: the wrong manifest URL,
 * the wrong network, a broken wallet connection. You notice it only on the
 * live site, and the symptoms don't reveal the cause.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

function walk(dir) {
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

// What the code actually reads.
const used = new Set();
for (const file of walk("src").filter((f) => /\.tsx?$/.test(f))) {
    // We strip comments: they contain examples like import.meta.env.VITE_X,
    // and without that the check argues with itself.
    const src = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const m of src.matchAll(/env\("(VITE_[A-Z0-9_]+)"\)/g)) used.add(m[1]);
    for (const m of src.matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g)) used.add(m[1]);
}

const workflow = readFileSync(".github/workflows/pages.yml", "utf8");
const passed = new Set(
    [...workflow.matchAll(/^\s+(VITE_[A-Z0-9_]+):/gm)].map((m) => m[1]),
);

let failed = 0;
const check = (name, ok, extra = "") => {
    console.log(ok ? `  ok   ${name}` : `  FAIL ${name} ${extra}`);
    if (!ok) failed++;
};

console.log(`build variables: code reads ${used.size}, workflow passes ${passed.size}`);

const missing = [...used].filter((v) => !passed.has(v)).sort();
check(
    "every read variable is passed to the build",
    missing.length === 0,
    missing.length ? `\n         not passed: ${missing.join(", ")}` : "",
);

// The reverse direction isn't an error but a sign of a forgotten variable.
const unused = [...passed].filter((v) => !used.has(v)).sort();
if (unused.length) {
    console.log(`  (workflow passes extras the code doesn't read: ${unused.join(", ")})`);
}

// .env.example is documentation for a human; a mismatch with the code
// misleads whoever configures the environment from it.
try {
    const example = readFileSync(".env.example", "utf8");
    const documented = new Set(
        [...example.matchAll(/^(VITE_[A-Z0-9_]+)=/gm)].map((m) => m[1]),
    );
    const undocumented = [...used].filter((v) => !documented.has(v)).sort();
    check(
        "every variable is documented in .env.example",
        undocumented.length === 0,
        undocumented.length ? `\n         undocumented: ${undocumented.join(", ")}` : "",
    );
} catch {
    check(".env.example is present", false);
}

// The public Solana node answers 403 to browser requests: it's not meant
// for apps. On devnet that's tolerable; on mainnet it means nothing
// will be read — and it looks like an endless load, not a rejection.
// So mainnet without its own RPC is a build error, not a surprise in prod.
try {
    const env = readFileSync(".env", "utf8");
    const val = (name) => env.match(new RegExp(`^\\s*${name}\\s*=\\s*(\\S*)`, "m"))?.[1] ?? "";
    if (val("VITE_SOLANA_NETWORK") === "mainnet") {
        check(
            "on mainnet Solana has its own RPC set",
            val("VITE_SOLANA_RPC").length > 0,
            "\n         VITE_SOLANA_RPC is empty, and api.mainnet-beta.solana.com" +
                "\n         answers the browser with 403 — you need your own node (Helius, QuickNode, Triton)",
        );
    }
} catch {
    // .env may be absent — in CI variables come from secrets.
}

console.log(failed === 0 ? "\nvariables reconcile" : `\nproblems: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
