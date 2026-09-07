import { defineConfig } from 'vite';
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

export default defineConfig({
    base,
    // Полифиллы нодовских глобалей живут в src/polyfills.ts, а не здесь:
    // плагин сборки не влияет на dev-режим, а модуль в графе влияет на оба.
    plugins: [react()],
    server: { port: 5173 },
});
