import { defineConfig } from 'vite';

export default defineConfig({
  base: '/web-video-trans/',
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  worker: {
    format: 'es',
  },
});
