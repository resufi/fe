import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * base — префикс пути, по которому раздаётся приложение.
 *
 * На GitHub Pages это `/<репозиторий>/`, а не корень сайта. Без него все
 * ссылки на скрипты и стили ведут в корень домена, и страница открывается
 * пустой. Значение подставляет сборка (см. .github/workflows/pages.yml),
 * чтобы имя репозитория не было зашито в код.
 */
const base = process.env.BASE_PATH ?? '/';

export default defineConfig(({ mode }) => ({
    base,

    /**
     * Переменные сборки — одним объектом.
     *
     * Vite подставляет только СТАТИЧЕСКОЕ обращение вида
     * import.meta.env.VITE_X. Но проверки логики гоняются в голом Node, где
     * import.meta.env нет вовсе, и статическое обращение там роняет модуль.
     * Через define значения попадают в бандл литералом, а в Node
     * идентификатор просто не определён — и код читает process.env.
     */
    define: {
        __RESU_ENV__: JSON.stringify(
            Object.fromEntries(
                Object.entries(loadEnv(mode, process.cwd(), 'VITE_')).filter(([k]) =>
                    k.startsWith('VITE_'),
                ),
            ),
        ),
    },
    // Полифиллы нодовских глобалей живут в src/polyfills.ts, а не здесь:
    // плагин сборки не влияет на dev-режим, а модуль в графе влияет на оба.
    plugins: [react()],
    server: { port: 5173 },
}));
