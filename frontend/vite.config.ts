import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Public files that are NOT part of the app shell (deployment/server files)
const PRECACHE_SKIP = new Set(['.htaccess', 'sw.js'])

function listPublic(dir: string, prefix = ''): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = `${prefix}${entry.name}`
    if (entry.isDirectory()) return listPublic(path.join(dir, entry.name), `${rel}/`)
    return PRECACHE_SKIP.has(rel) ? [] : [rel]
  })
}

/**
 * Emits /sw.js (template: sw/sw.js) with the list of files to precache and a version that changes whenever any of them changes.
 * Production build only; the service worker is never registered in `vite dev` (src/lib/pwa.ts).
 */
function liftelloServiceWorker(): Plugin {
  const publicDir = path.resolve(__dirname, 'public')
  return {
    name: 'liftelo-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const urls = new Set<string>(['/', '/index.html'])
      const hash = createHash('sha256')
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (!/\.(js|css|woff2?|svg|png|jpg|webp)$/.test(fileName)) continue
        urls.add(`/${fileName}`)
        hash.update(fileName) // hashed names already change with the content
        if (chunk.type === 'asset' && !/\.(js|css)$/.test(fileName)) hash.update(chunk.source)
      }
      const html = bundle['index.html']
      if (html && html.type === 'asset') hash.update(html.source)
      for (const rel of listPublic(publicDir).sort()) {
        urls.add(`/${rel}`)
        hash.update(rel)
        hash.update(fs.readFileSync(path.join(publicDir, rel)))
      }
      const template = fs.readFileSync(path.resolve(__dirname, 'sw', 'sw.js'), 'utf8')
      const source = template
        .replace('__SW_VERSION__', hash.digest('hex').slice(0, 16))
        .replace('/*__SW_PRECACHE__*/ []', JSON.stringify([...urls].sort(), null, 2))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), liftelloServiceWorker()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
})
