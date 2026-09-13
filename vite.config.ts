import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const base = process.env.BASE_PATH ?? '/';

export default defineConfig(({ mode }) => ({
    base,

    define: {
        __RESU_ENV__: JSON.stringify(
            Object.fromEntries(
                Object.entries(loadEnv(mode, process.cwd(), 'VITE_')).filter(([k]) =>
                    k.startsWith('VITE_'),
                ),
            ),
        ),
    },

    plugins: [react()],
    server: { port: 5173 },
}));
