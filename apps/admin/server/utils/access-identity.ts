import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose'

const remoteKeySets = new Map<string, JWTVerifyGetKey>()

function remoteKeySet(issuer: string) {
  const normalizedIssuer = issuer.replace(/\/+$/u, '')
  let keySet = remoteKeySets.get(normalizedIssuer)
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(`${normalizedIssuer}/cdn-cgi/access/certs`))
    remoteKeySets.set(normalizedIssuer, keySet)
  }
  return { issuer: normalizedIssuer, keySet }
}

export async function verifyAccessIdentityToken(
  token: string,
  issuer: string,
  audience: string,
  keySet?: JWTVerifyGetKey,
) {
  const remote = remoteKeySet(issuer)
  const { payload } = await jwtVerify(token, keySet || remote.keySet, {
    issuer: remote.issuer,
    audience,
  })
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  if (!email) throw new Error('Cloudflare Access identity has no email')
  return { email }
}
