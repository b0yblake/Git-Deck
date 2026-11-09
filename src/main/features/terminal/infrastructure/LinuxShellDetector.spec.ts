import { describe, expect, it } from 'vitest'
import { createFakeLogger } from '@main/testing/FakeLogger'
import { detectLinuxShellProfiles } from './LinuxShellDetector'

const detect = (installed: readonly string[], shell?: string): string[] =>
  detectLinuxShellProfiles({
    probe: (path) => installed.includes(path),
    env: shell === undefined ? {} : { SHELL: shell },
    logger: createFakeLogger()
  }).map((profile) => profile.id)

describe('detectLinuxShellProfiles', () => {
  it('reports only what is installed', () => {
    expect(detect(['/bin/bash', '/usr/bin/fish'])).toEqual(['bash', 'fish'])
  })

  it('puts the login shell first, so it becomes the default', () => {
    expect(detect(['/usr/bin/bash', '/usr/bin/zsh'], '/usr/bin/zsh')).toEqual(['zsh', 'bash'])
  })

  it('keeps the fixed order for a login shell it does not know', () => {
    expect(detect(['/usr/bin/bash', '/usr/bin/zsh'], '/bin/dash')).toEqual(['bash', 'zsh'])
  })
})
