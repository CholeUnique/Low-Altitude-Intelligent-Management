import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = {
    '/api': {
      target: env.API_PROXY_TARGET || 'http://58.213.29.196:38080',
      changeOrigin: true,
      timeout: 600_000,
      proxyTimeout: 600_000,
    },
  }
  return {
    base: '/',
    plugins: [
      vue(),
      AutoImport({ resolvers: [ElementPlusResolver()] }),
      Components({ resolvers: [ElementPlusResolver()] }),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender')) return 'vendor-charts'
            if (id.includes('node_modules/leaflet')) return 'vendor-map'
          },
        },
      },
    },
    server: {
      port: 5173,
      host: true,
      proxy,
    },
    // 用正式构建产物验证同源接口；正式服务器使用 deploy/nginx.conf。
    preview: { host: true, port: 38081, strictPort: true, proxy },
  }
})
