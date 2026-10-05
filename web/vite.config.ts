import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// es2022 for the top-level await in src/firebase.ts.
export default defineConfig({ plugins: [react()], build: { target: 'es2022' } });
