import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
    plugins: [react()],

    define: {
        'process.env.NODE_ENV': '"production"',

        __RESU_ENV__: JSON.stringify(loadEnv(mode, process.cwd(), 'VITE_')),
    },
    build: {
        outDir: 'dist-smoke',
        emptyOutDir: true,
        lib: { entry: 'src/main.tsx', formats: ['iife'], name: 'ResuApp', fileName: () => 'smoke.js' },
    },
}));
