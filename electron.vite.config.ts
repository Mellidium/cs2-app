import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/**
 * The renderer's index.html ships a strict production CSP (`script-src 'self'`).
 * In dev, @vitejs/plugin-react injects an inline HMR preamble <script> and Vite
 * talks to the page over a websocket — both of which that CSP blocks, leaving a
 * blank screen ("can't detect preamble"). This relaxes the CSP only while the
 * dev server is serving; production builds keep the original strict policy.
 */
function relaxCspInDev(): Plugin {
  return {
    name: 'relax-csp-in-dev',
    apply: 'serve',
    transformIndexHtml(html) {
      return html
        .replace("default-src 'self';", "default-src 'self'; connect-src 'self' ws:;")
        .replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          // Worker-thread entry: demo parsing runs off the main thread.
          'demo-worker': resolve(__dirname, 'src/main/demo/demo-worker.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), relaxCspInDev()]
  }
})
