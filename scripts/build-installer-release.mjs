import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join, relative, resolve, sep } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const outputDir = join(root, '.installer', 'release')
const bundlePath = join(root, '.installer', 'bundle', 'index.js')
const assetsDir = join(root, '.output', 'public')
const migrationsDir = join(root, 'drizzle', 'migrations')

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const version = (process.env.DISCOFLARE_RELEASE_VERSION || packageJson.version).replace(/^v/, '')
const releaseBaseUrl = process.env.DISCOFLARE_RELEASE_BASE_URL
  || `https://github.com/vnmtvlv/discoflare/releases/download/v${version}`

const contentTypes = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webm': 'video/webm',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
}

function digest(algorithm, value) {
  return createHash(algorithm).update(value).digest('hex')
}

async function filesUnder(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await filesUnder(path))
    else if (entry.isFile()) result.push(path)
  }
  return result.sort()
}

await rm(outputDir, { recursive: true, force: true })
await mkdir(outputDir, { recursive: true })

const worker = await readFile(bundlePath)
const workerName = 'discoflare-worker.mjs'
await writeFile(join(outputDir, workerName), worker)

const assets = []
for (const file of await filesUnder(assetsDir)) {
  const content = await readFile(file)
  assets.push({
    path: `/${relative(assetsDir, file).split(sep).join('/')}`,
    hash: digest('md5', content),
    size: content.byteLength,
    contentType: contentTypes[extname(file).toLowerCase()] || 'application/octet-stream',
    contentBase64: content.toString('base64'),
  })
}

const migrations = []
for (const file of (await filesUnder(migrationsDir)).filter(path => path.endsWith('.sql'))) {
  migrations.push({
    name: basename(file),
    sql: await readFile(file, 'utf8'),
  })
}

const assetsName = 'discoflare-assets.json'
const assetsPayload = Buffer.from(JSON.stringify({ assets, migrations }))
await writeFile(join(outputDir, assetsName), assetsPayload)

const manifest = {
  schemaVersion: 1,
  version,
  releasedAt: new Date().toISOString(),
  compatibilityDate: '2026-09-02',
  compatibilityFlags: ['nodejs_compat'],
  worker: {
    url: `${releaseBaseUrl}/${workerName}`,
    sha256: digest('sha256', worker),
    size: worker.byteLength,
  },
  assets: {
    url: `${releaseBaseUrl}/${assetsName}`,
    sha256: digest('sha256', assetsPayload),
    size: assetsPayload.byteLength,
  },
  container: {
    image: `docker.io/vnmtvlv/discoflare-sandbox:${version}`,
    className: 'Sandbox',
    instanceType: 'lite',
    maxInstances: 10,
  },
  durableObjects: [
    { binding: 'CHANNEL_DO', className: 'ChannelDurableObject', migration: 'v1' },
    { binding: 'WORKSPACE_DO', className: 'WorkspaceDurableObject', migration: 'v1' },
    { binding: 'RATE_LIMIT_DO', className: 'RateLimitDurableObject', migration: 'v1' },
    { binding: 'NOTIFICATION_DO', className: 'NotificationDurableObject', migration: 'v2' },
    { binding: 'AGENT_DO', className: 'DiscoflareAgent', migration: 'v3' },
    { binding: 'AGENT_SANDBOX', className: 'Sandbox', migration: 'v3' },
    { binding: 'AGENT_THINK', className: 'DiscoflareThink', migration: 'v4' },
  ],
  workflow: {
    binding: 'AGENT_TASK_WORKFLOW',
    className: 'AgentTaskWorkflow',
  },
}

await writeFile(join(outputDir, 'discoflare-cloudflare-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

const outputSize = (await stat(join(outputDir, assetsName))).size
console.log(`Built Discoflare installer release ${version}: ${assets.length} assets, ${migrations.length} migrations, ${outputSize} byte asset payload.`)
