import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
   root: './',
   build: {
      outDir: '../release',
      rollupOptions: {
         input: {
            main: resolve(__dirname, 'index.html'),
            player: resolve(__dirname, 'player.html'),
            staff: resolve(__dirname, 'staff.html'),
         },
      },
   },
   publicDir: 'public',
});