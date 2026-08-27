import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    // Полифиллы нодовских глобалей живут в src/polyfills.ts, а не здесь:
    // плагин сборки не влияет на dev-режим, а модуль в графе влияет на оба.
    plugins: [react()],
    server: { port: 5173 },
});
