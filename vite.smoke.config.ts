import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Сборка для дымового теста: один IIFE-файл вместо ES-модулей,
 * потому что jsdom модули не исполняет.
 */
export default defineConfig(({ mode }) => ({
    plugins: [react()],
    // При обычном `vite build` Vite сам подставляет NODE_ENV; в режиме
    // библиотеки — нет, и React падает на ReferenceError. Подставляем вручную,
    // чтобы сборка для теста вела себя как настоящая.
    define: {
        'process.env.NODE_ENV': '"production"',
        // Те же переменные сборки, что и в боевой конфигурации: иначе
        // дымовой тест проверяет не то приложение, которое публикуется.
        __RESU_ENV__: JSON.stringify(loadEnv(mode, process.cwd(), 'VITE_')),
    },
    build: {
        outDir: 'dist-smoke',
        emptyOutDir: true,
        lib: { entry: 'src/main.tsx', formats: ['iife'], name: 'ResuApp', fileName: () => 'smoke.js' },
    },
}));
