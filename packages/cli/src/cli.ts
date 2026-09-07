#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import {
  findDiscoflareInstallations,
  installDiscoflare,
  installerErrorMessage,
  type DeployProgressEvent,
  type DeployRequest,
} from '@discoflare/installer-core'

type Arguments = {
  command: string
  positionals: string[]
  flags: Map<string, string>
}

function parseArguments(argv: string[]): Arguments {
  const [command = 'help', ...rest] = argv
  const positionals: string[] = []
  const flags = new Map<string, string>()
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index]!
    if (!value.startsWith('--')) {
      positionals.push(value)
      continue
    }
    const [name, inline] = value.slice(2).split('=', 2)
    const next = inline ?? rest[index + 1]
    if (!name || !next || (inline === undefined && next.startsWith('--'))) throw new Error(`Missing value for --${name || value}`)
    flags.set(name, next)
    if (inline === undefined) index += 1
  }
  return { command, positionals, flags }
}

function usage(): string {
  return `Discoflare CLI

Usage:
  discoflare inspect <https://workspace.example.com>
  discoflare install --config <discoflare.json> [--manifest <https-url>]
  discoflare update <https://workspace.example.com> [--version <v0.3.1>] [--manifest <https-url>]

Set CLOUDFLARE_API_TOKEN to an API token with the permissions documented in
https://github.com/vnmtvlv/discoflare/blob/main/docs/deployment.md.

The CLI reads GitHub Release artifacts directly. It does not call discoflare.com.`
}

function token(): string {
  const value = process.env.CLOUDFLARE_API_TOKEN?.trim()
  if (!value) throw new Error('CLOUDFLARE_API_TOKEN is required')
  return value
}

function report(event: Extract<DeployProgressEvent, { type: 'progress' }>) {
  const detail = event.detail ? ` — ${event.detail}` : ''
  process.stderr.write(`${event.state === 'active' ? '→' : '✓'} ${event.step}${detail}\n`)
}

async function readConfig(path: string): Promise<DeployRequest> {
  return JSON.parse(await readFile(path, 'utf8')) as DeployRequest
}

async function inspect(origin: string) {
  const installations = await findDiscoflareInstallations(token(), origin)
  process.stdout.write(`${JSON.stringify({ installations }, null, 2)}\n`)
}

async function install(args: Arguments) {
  const configPath = args.flags.get('config')
  if (!configPath) throw new Error('--config is required')
  const result = await installDiscoflare(token(), await readConfig(configPath), {
    manifestUrl: args.flags.get('manifest'),
    report,
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

async function update(args: Arguments) {
  const origin = args.positionals[0]
  if (!origin) throw new Error('Workspace origin is required')
  const installations = await findDiscoflareInstallations(token(), origin)
  if (installations.length !== 1) throw new Error(`Expected exactly one Discoflare installation for ${origin}; found ${installations.length}`)
  const installation = installations[0]!
  const request: DeployRequest = {
    ...installation.configuration,
    targetVersion: args.flags.get('version'),
  }
  const result = await installDiscoflare(token(), request, {
    manifestUrl: args.flags.get('manifest'),
    report,
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

async function main() {
  const args = parseArguments(process.argv.slice(2))
  if (args.command === 'help' || args.flags.has('help')) {
    process.stdout.write(`${usage()}\n`)
    return
  }
  if (args.command === 'inspect') return inspect(args.positionals[0] || '')
  if (args.command === 'install') return install(args)
  if (args.command === 'update') return update(args)
  throw new Error(`Unknown command ${args.command}\n\n${usage()}`)
}

main().catch((error) => {
  process.stderr.write(`Discoflare: ${installerErrorMessage(error)}\n`)
  process.exitCode = 1
})
