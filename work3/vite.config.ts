import { defineConfig } from 'vite'

export default defineConfig({
  // GitHub Pages 등 서브경로 배포 대비. 루트 배포면 '/'로 두면 됨
  base: './',
  server: {
    host: true, // LAN 노출 (아이패드에서 접근 가능)
    port: 5173,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
})
