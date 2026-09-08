/**
 * Сверяет переменные сборки: что читает код против того, что передаёт
 * workflow публикации.
 *
 * Пропущенная переменная — не ошибка сборки. Приложение соберётся,
 * опубликуется и молча уйдёт в запасное поведение: не тот адрес манифеста,
 * не та сеть, неработающее подключение кошелька. Замечается это уже на
 * живом сайте, и по симптомам причину не угадать.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

function walk(dir) {
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

// Что код действительно читает.
const used = new Set();
for (const file of walk("src").filter((f) => /\.tsx?$/.test(f))) {
    // Комментарии вырезаем: в них попадаются примеры вида import.meta.env.VITE_X,
    // и без этого проверка спорит сама с собой.
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

console.log(`переменные сборки: код читает ${used.size}, workflow передаёт ${passed.size}`);

const missing = [...used].filter((v) => !passed.has(v)).sort();
check(
    "все читаемые переменные передаются в сборку",
    missing.length === 0,
    missing.length ? `\n         не передаются: ${missing.join(", ")}` : "",
);

// Обратное направление — не ошибка, но признак забытой переменной.
const unused = [...passed].filter((v) => !used.has(v)).sort();
if (unused.length) {
    console.log(`  (workflow передаёт лишнее, код не читает: ${unused.join(", ")})`);
}

// .env.example — документация для человека; расхождение с кодом вводит в
// заблуждение того, кто по нему настраивает окружение.
try {
    const example = readFileSync(".env.example", "utf8");
    const documented = new Set(
        [...example.matchAll(/^(VITE_[A-Z0-9_]+)=/gm)].map((m) => m[1]),
    );
    const undocumented = [...used].filter((v) => !documented.has(v)).sort();
    check(
        "все переменные описаны в .env.example",
        undocumented.length === 0,
        undocumented.length ? `\n         не описаны: ${undocumented.join(", ")}` : "",
    );
} catch {
    check(".env.example на месте", false);
}

console.log(failed === 0 ? "\nпеременные сходятся" : `\nпроблем: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
