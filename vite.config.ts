
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Permite usar process.env em alguns contextos se necessário, 
    // mas o padrão do Vite é import.meta.env
    'process.env': {}
  }
});
