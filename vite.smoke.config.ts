import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Сборка для дымового теста: один IIFE-файл вместо ES-модулей,
 * потому что jsdom модули не исполняет.
 */
export default defineConfig({
    plugins: [react()],
    // При обычном `vite build` Vite сам подставляет NODE_ENV; в режиме
    // библиотеки — нет, и React падает на ReferenceError. Подставляем вручную,
    // чтобы сборка для теста вела себя как настоящая.
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
        outDir: 'dist-smoke',
        emptyOutDir: true,
        lib: { entry: 'src/main.tsx', formats: ['iife'], name: 'ResuApp', fileName: () => 'smoke.js' },
    },
});
