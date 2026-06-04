import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@vrsi/person-identity': path.resolve(__dirname, '../server/src/lib/personIdentity.ts'),
        },
    },
    server: {
        proxy: {
            '/api': 'http://localhost:3001',
        },
    },
});
