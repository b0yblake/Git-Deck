import { describe, expect, it } from 'vitest'
import { PortAccessDeniedError, PortTerminationError } from '../domain/errors'
import { createLinuxPortAdapter, parseSsOutput, SS_ARGS } from './LinuxPortAdapter'
import type { PortCommandOutcome, PortCommandRunner } from './WindowsPortAdapter'

const runner = (
  outcome: PortCommandOutcome
): { run: PortCommandRunner; calls: Array<readonly [string, readonly string[]]> } => {
  const calls: Array<readonly [string, readonly string[]]> = []
  return {
    calls,
    run: (file, args) => {
      calls.push([file, args])
      return Promise.resolve(outcome)
    }
  }
}

const exit = (stderr: string): PortCommandOutcome => ({ kind: 'exit', code: 1, stdout: '', stderr })

const ticks = (startTime: number): string => [...Array<number>(18).fill(0), startTime].join(' ')

const PROC: Record<string, string> = {
  '/proc/stat': 'cpu 1 2 3\nbtime 1000\n',
  '/proc/42/stat': `42 (my (odd) app) S ${ticks(500)}`,
  '/proc/42/status': 'Name:\tx\nUid:\t1000\t1000\t1000\t1000\n',
  '/proc/7/stat': `7 (self) S ${ticks(1)}`,
  '/proc/7/status': 'Uid:\t1000\t1000\t1000\t1000\n'
}

const read = (path: string): string => {
  const text = PROC[path]
  if (text === undefined) throw new Error(`ENOENT ${path}`)
  return text
}

describe('parseSsOutput', () => {
  it('reads protocol, address, port and pid', () => {
    expect(
      parseSsOutput('tcp LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=42,fd=20))\n')
    ).toEqual([{ protocol: 'tcp', localAddress: '127.0.0.1', localPort: 3000, pid: 42 }])
  })

  it('unwraps an IPv6 address', () => {
    expect(
      parseSsOutput('tcp LISTEN 0 511 [::1]:80 [::]:* users:(("node",pid=42,fd=20))')[0]
        ?.localAddress
    ).toBe('::1')
  })

  it('reports each owner of a shared socket', () => {
    const rows = parseSsOutput(
      'tcp LISTEN 0 511 0.0.0.0:80 0.0.0.0:* users:(("a",pid=1,fd=2),("b",pid=3,fd=4))'
    )
    expect(rows.map(({ pid }) => pid)).toEqual([1, 3])
  })

  it('keeps a socket whose owner is hidden, as PID 0', () => {
    expect(parseSsOutput('udp UNCONN 0 0 0.0.0.0:36741 0.0.0.0:*')[0]?.pid).toBe(0)
  })

  it('does not take a pid out of a process name', () => {
    const rows = parseSsOutput('tcp LISTEN 0 1 0.0.0.0:80 0.0.0.0:* users:(("pid=9",pid=3,fd=4))')
    expect(rows.map(({ pid }) => pid)).toEqual([3])
  })

  it('rejects a malformed row rather than guessing', () => {
    expect(() => parseSsOutput('garbage')).toThrow()
  })
})

describe('inspect', () => {
  const STDOUT = 'tcp LISTEN 0 1 0.0.0.0:80 0.0.0.0:* users:(("a",pid=42,fd=4),("b",pid=99,fd=4))'

  it('runs the fixed ss command', async () => {
    const { run, calls } = runner({ kind: 'ok', stdout: '' })

    await createLinuxPortAdapter({ ownPid: 7, run, read }).inspect()

    expect(calls).toEqual([['/usr/bin/ss', SS_ARGS]])
  })

  it('reads identity from /proc, with the UID as the session', async () => {
    const { run } = runner({ kind: 'ok', stdout: STDOUT })

    const { processes } = await createLinuxPortAdapter({ ownPid: 7, run, read }).inspect()

    expect(processes).toContainEqual({
      pid: 42,
      name: 'my (odd) app',
      startedAt: 1_000_000 + 5_000,
      sessionId: 1000
    })
  })

  it('always includes its own process, and omits one it cannot read', async () => {
    const { run } = runner({ kind: 'ok', stdout: STDOUT })

    const { processes } = await createLinuxPortAdapter({ ownPid: 7, run, read }).inspect()

    expect(processes.map(({ pid }) => pid)).toEqual([7, 42])
  })
})

describe('terminate', () => {
  const terminate = (outcome: PortCommandOutcome, pid = 100): Promise<string> =>
    createLinuxPortAdapter({ ownPid: 7, run: runner(outcome).run, read }).terminate(pid)

  it('runs kill with exactly -KILL and the decimal pid', async () => {
    const { run, calls } = runner({ kind: 'ok', stdout: '' })

    await createLinuxPortAdapter({ ownPid: 7, run, read }).terminate(18420)

    expect(calls).toEqual([['/usr/bin/kill', ['-KILL', '18420']]])
  })

  it.each([-1, 0, 1, 1.5])('refuses pid %s before running anything', async (pid) => {
    await expect(terminate({ kind: 'ok', stdout: '' }, pid)).rejects.toBeInstanceOf(
      PortTerminationError
    )
  })

  it('a vanished process is already-exited', async () => {
    await expect(terminate(exit('kill: (100): No such process'))).resolves.toBe('already-exited')
  })

  it('a refusal surfaces as the typed denial', async () => {
    await expect(terminate(exit('kill: (100): Operation not permitted'))).rejects.toBeInstanceOf(
      PortAccessDeniedError
    )
  })
})
