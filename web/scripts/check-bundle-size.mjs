// Performance budget gate: fails CI if the JS a user downloads on first
// visit (entry script + modulepreloaded chunks listed in dist/index.html)
// exceeds the budget, gzip-compressed. Lazy route chunks are not counted.
//   JS_BUDGET_KB=170 npm run size
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const BUDGET_KB = Number(process.env.JS_BUDGET_KB ?? 195) // ratchet down as we optimise (target: 170)
const dist = 'dist'
const html = readFileSync(join(dist, 'index.html'), 'utf8')

const files = [
  ...html.matchAll(/<script[^>]+type="module"[^>]+src="\/([^"]+\.js)"/g),
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/([^"]+\.js)"/g),
].map((m) => m[1])

if (!files.length) {
  console.error('No entry scripts found in dist/index.html. Run `npm run build` first.')
  process.exit(1)
}

let total = 0
const rows = files.map((file) => {
  const gz = gzipSync(readFileSync(join(dist, file)), { level: 9 }).length
  total += gz
  return { file, 'gzip KB': +(gz / 1024).toFixed(1) }
})
console.table(rows)

const totalKb = total / 1024
const pct = ((totalKb / BUDGET_KB) * 100).toFixed(0)
const line = `Initial JS: ${totalKb.toFixed(1)} KB gzip / budget ${BUDGET_KB} KB (${pct}%)`

if (totalKb > BUDGET_KB) {
  console.error(`❌ ${line}. Over budget. Check \`npm run analyze\` for what grew.`)
  process.exit(1)
}
console.log(`✅ ${line}`)
