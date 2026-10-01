import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  server: { port: 5199 },
  // @breign/client est un paquet CommonJS lié en file:. Sans pré-bundle, Vite le sert tel quel
  // et les imports nommés (AgentApi, …) échouent.
  optimizeDeps: { include: ['@breign/client'] },
});
