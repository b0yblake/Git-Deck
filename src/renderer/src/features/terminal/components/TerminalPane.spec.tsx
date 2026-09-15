import { describe, expect, it } from 'vitest'
import { trailingPath } from './TerminalPane'

describe('trailingPath', () => {
  it('keeps the last four segments of a long path', () => {
    expect(trailingPath('C:\\Users\\me\\Downloads\\repo\\packages\\app')).toBe(
      'Downloads\\repo\\packages\\app'
    )
    expect(trailingPath('/home/me/src/repo/packages/app')).toBe('src/repo/packages/app')
  })

  it('leaves a short path alone', () => {
    expect(trailingPath('C:/work')).toBe('C:/work')
    expect(trailingPath('C:\\work\\repo')).toBe('C:\\work\\repo')
  })
})
