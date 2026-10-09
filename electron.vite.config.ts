import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

/* ------------------------------ CSP injection ------------------------------ */

// Dev needs 'unsafe-inline' scripts (React refresh preamble) and the HMR
// websocket; production gets a strict policy. The HTML entries contain the
// placeholder `__CSP__`, replaced below depending on the build mode.
const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' ws://127.0.0.1:* ws://localhost:* http://127.0.0.1:* http://localhost:*"
].join('; ')

const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // React inline style attributes
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

function cspPlugin(): Plugin {
  return {
    name: 'askthis-csp',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        return html.replace('__CSP__', ctx.server ? DEV_CSP : PROD_CSP)
      }
    }
  }
}

/* ------------------------------ config ------------------------------ */

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    // Bind IPv4 explicitly: some tools (and Node's localhost resolution on
    // macOS) prefer ::1, which makes 127.0.0.1 readiness probes fail.
    server: {
      host: '127.0.0.1'
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@': resolve(__dirname, 'src/renderer/src')
      }
    },
    build: {
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'src/renderer/popup.html'),
          settings: resolve(__dirname, 'src/renderer/settings.html')
        }
      }
    },
    plugins: [react(), cspPlugin()]
  }
})
