import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import type { Logger } from '@main/bootstrap/logger'
import type { ShellProfile } from '../domain/ShellProfile'
import {
  detectShellProfiles,
  type Candidate,
  type DetectShellProfilesOptions
} from './WindowsShellDetector'

const CANDIDATES: readonly Candidate[] = [
  { id: 'bash', label: 'Bash', args: [], locations: () => ['/usr/bin/bash', '/bin/bash'] },
  { id: 'zsh', label: 'Zsh', args: [], locations: () => ['/usr/bin/zsh', '/bin/zsh'] },
  { id: 'fish', label: 'Fish', args: [], locations: () => ['/usr/bin/fish', '/bin/fish'] }
]

/**
 * The login shell leads, because the first profile is the default for a user
 * with no saved preference. `$SHELL` does not change between launches, so the
 * menu still does not reshuffle.
 */
export const detectLinuxShellProfiles = (options: DetectShellProfilesOptions): ShellProfile[] => {
  const loginShell = basename(options.env['SHELL'] ?? '')
  const isLogin = (candidate: Candidate): number => Number(candidate.id === loginShell)

  return detectShellProfiles({
    ...options,
    candidates: [...CANDIDATES].sort((a, b) => isLogin(b) - isLogin(a))
  })
}

export const detectInstalledLinuxShellProfiles = (logger: Logger): ShellProfile[] =>
  detectLinuxShellProfiles({ probe: existsSync, env: process.env, logger })
