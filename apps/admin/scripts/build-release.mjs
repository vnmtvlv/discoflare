import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const repositoryRoot = resolve(appRoot, '../..')
const outputDir = join(repositoryRoot, '.installer', 'release')
const bundlePath = join(appRoot, '.admin-release', 'bundle', 'index.js')
const assetsDir = join(appRoot, '.output', 'public')
const packageJson = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'))
const version = (process.env.DISCOFLARE_RELEASE_VERSION || packageJson.version).replace(/^v/u, '')
const releaseBaseUrl = process.env.DISCOFLARE_RELEASE_BASE_URL
  || `https://github.com/vnmtvlv/discoflare/releases/download/v${version}`

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
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

await mkdir(outputDir, { recursive: true })

const worker = await readFile(bundlePath)
const workerName = 'discoflare-admin-worker.mjs'
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

const assetsName = 'discoflare-admin-assets.json'
const assetsPayload = Buffer.from(JSON.stringify({ assets }))
await writeFile(join(outputDir, assetsName), assetsPayload)

const manifest = {
  schemaVersion: 1,
  version,
  releasedAt: new Date().toISOString(),
  compatibilityDate: '2026-09-09',
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
}

await writeFile(join(outputDir, 'discoflare-admin-cloudflare-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
const outputSize = (await stat(join(outputDir, assetsName))).size
console.log(`Built Discoflare Admin release ${version}: ${assets.length} assets, ${outputSize} byte asset payload.`)
