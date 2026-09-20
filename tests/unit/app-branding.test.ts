import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APP_NAME,
  DEFAULT_APP_SUBTITLE,
  DEFAULT_APP_TITLE,
  readAppBranding,
} from '../../shared/app-branding'

describe('readAppBranding', () => {
  it('uses the Discoflare defaults when values are missing or blank', () => {
    expect(readAppBranding()).toEqual({
      appName: DEFAULT_APP_NAME,
      appTitle: DEFAULT_APP_TITLE,
      appSubtitle: DEFAULT_APP_SUBTITLE,
    })
    expect(readAppBranding({ APP_NAME: ' ', APP_TITLE: ' ', APP_SUBTITLE: ' ' })).toEqual({
      appName: DEFAULT_APP_NAME,
      appTitle: DEFAULT_APP_TITLE,
      appSubtitle: DEFAULT_APP_SUBTITLE,
    })
  })

  it('normalizes the name and subtitle and supports an escaped title line break', () => {
    expect(readAppBranding({
      APP_NAME: '  Campfire   Club  ',
      APP_TITLE: '  One workspace.\\nEvery kind of teammate.  ',
      APP_SUBTITLE: '  Built   on your Cloudflare stack.  ',
    })).toEqual({
      appName: 'Campfire Club',
      appTitle: 'One workspace.\nEvery kind of teammate.',
      appSubtitle: 'Built on your Cloudflare stack.',
    })
  })

  it('bounds public copy returned to the client', () => {
    const branding = readAppBranding({
      APP_NAME: 'n'.repeat(100),
      APP_TITLE: 't'.repeat(200),
      APP_SUBTITLE: 's'.repeat(300),
    })

    expect(branding.appName).toHaveLength(80)
    expect(branding.appTitle).toHaveLength(160)
    expect(branding.appSubtitle).toHaveLength(240)
  })
})
