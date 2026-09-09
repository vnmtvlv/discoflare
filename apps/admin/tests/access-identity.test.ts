import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { verifyAccessIdentityToken } from '../server/utils/access-identity'

describe('Cloudflare Access identity', () => {
  it('accepts a signed token for the configured issuer and audience', async () => {
    const issuer = 'https://example.cloudflareaccess.com'
    const audience = 'admin-audience'
    const { privateKey, publicKey } = await generateKeyPair('RS256')
    const jwk = await exportJWK(publicKey)
    jwk.kid = 'test-key'

    const token = await new SignJWT({ email: 'OWNER@EXAMPLE.COM' })
      .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey)

    await expect(verifyAccessIdentityToken(
      token,
      issuer,
      audience,
      createLocalJWKSet({ keys: [jwk] }),
    )).resolves.toEqual({ email: 'owner@example.com' })
  })

  it('rejects a token issued for another Access application', async () => {
    const issuer = 'https://example.cloudflareaccess.com'
    const { privateKey, publicKey } = await generateKeyPair('RS256')
    const jwk = await exportJWK(publicKey)
    jwk.kid = 'test-key'
    const token = await new SignJWT({ email: 'owner@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
      .setIssuer(issuer)
      .setAudience('another-audience')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey)

    await expect(verifyAccessIdentityToken(
      token,
      issuer,
      'admin-audience',
      createLocalJWKSet({ keys: [jwk] }),
    )).rejects.toThrow()
  })
})
