// Uploads dist/*.map to Datadog so RUM errors show original file:line, then
// deletes the maps so they are never deployed. Run after `npm run build`.
//   PowerShell: $env:DATADOG_API_KEY="..."; $env:VITE_APP_VERSION="1.0.0"; npm run sourcemaps:upload
import { execFileSync } from 'node:child_process'
import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const version = process.env.VITE_APP_VERSION
if (!process.env.DATADOG_API_KEY) throw new Error('Set DATADOG_API_KEY (an API key, not the client token)')
if (!version || version === 'dev') throw new Error('Set VITE_APP_VERSION to the same value used for `npm run build`')

execFileSync(
  'npx',
  [
    'datadog-ci', 'sourcemaps', 'upload', './dist',
    '--service=depot-observability-ui',
    `--release-version=${version}`, // must equal the SDK's `version`
    '--minified-path-prefix=/', // where the JS is served from
  ],
  { stdio: 'inherit', shell: true, env: { DATADOG_SITE: 'datadoghq.com', ...process.env } },
)

const assets = join('dist', 'assets')
for (const f of readdirSync(assets).filter((f) => f.endsWith('.map'))) rmSync(join(assets, f))
console.log('Source maps uploaded and removed from dist/')
