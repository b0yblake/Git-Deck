import { readFileSync } from 'node:fs'
import {
  PortAccessDeniedError,
  PortInspectionError,
  PortInspectionTimeoutError,
  PortTerminationError
} from '../domain/errors'
import type {
  PortAdapter,
  PortInspection,
  PortTerminationOutcome,
  RawPortBinding,
  RawProcessIdentity
} from '../domain/PortAdapter'
import {
  createPortCommandRunner,
  INSPECT_TIMEOUT_MS,
  KILL_TIMEOUT_MS,
  MAX_INSPECTION_OUTPUT_BYTES,
  MAX_KILL_OUTPUT_BYTES,
  type PortCommandRunner
} from './WindowsPortAdapter'

/**
 * The Linux half of the OS boundary: `ss` to enumerate, `/proc` for identity,
 * `kill` to terminate. Both commands are fixed, and the only variable argument
 * is a validated decimal PID.
 */
const SS = '/usr/bin/ss'
const KILL = '/usr/bin/kill'

export const SS_ARGS = ['-H', '-l', '-n', '-t', '-u', '-p'] as const

/**
 * `ss` hides the owner of another user's socket from a non-root caller. PID 0
 * keeps that row visible while `groupPortProcesses` refuses to terminate it.
 */
const HIDDEN_OWNER_PID = 0

/** The kernel's USER_HZ, which is 100 on every Linux architecture Electron ships for. */
const MS_PER_CLOCK_TICK = 10

/** Field 22 of `/proc/<pid>/stat`, counted from the first field after `comm`. */
const START_TIME_INDEX = 19

export type ProcReader = (path: string) => string

const parseLocalAddress = (local: string): Pick<RawPortBinding, 'localAddress' | 'localPort'> => {
  const separator = local.lastIndexOf(':')
  const port = Number(local.slice(separator + 1))
  if (separator <= 0 || !Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new PortInspectionError('a binding row has no local port')
  }
  return { localAddress: local.slice(0, separator).replace(/[[\]]/g, ''), localPort: port }
}

/** Exported for the unit suite; throws `PortInspectionError` on anything malformed. */
export const parseSsOutput = (stdout: string): RawPortBinding[] =>
  stdout
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      const [protocol, , , , local, , ...owners] = line.trim().split(/\s+/)
      if ((protocol !== 'tcp' && protocol !== 'udp') || local === undefined) {
        throw new PortInspectionError('a binding row is malformed')
      }

      // A forked server shares one socket between several owners.
      const pids = [...owners.join(' ').matchAll(/,pid=(\d+),fd=/g)].map(([, pid]) => Number(pid))
      return (pids.length > 0 ? pids : [HIDDEN_OWNER_PID]).map((pid): RawPortBinding => ({
        protocol,
        ...parseLocalAddress(local),
        pid
      }))
    })

/**
 * Null when the process cannot be read, which leaves its row non-terminable.
 *
 * `sessionId` carries the real UID. A Linux session id differs per terminal,
 * so the boundary that matches a Windows logon session is the owning user.
 */
const readIdentity = (pid: number, read: ProcReader, bootMs: number): RawProcessIdentity | null => {
  try {
    const stat = read(`/proc/${pid}/stat`)
    // `comm` may itself contain spaces and parentheses.
    const open = stat.indexOf('(')
    const close = stat.lastIndexOf(')')
    const startTicks = Number(stat.slice(close + 2).split(' ')[START_TIME_INDEX])
    const uid = /^Uid:\s+(\d+)/m.exec(read(`/proc/${pid}/status`))?.[1]

    return {
      pid,
      name: stat.slice(open + 1, close) || null,
      startedAt: Number.isFinite(startTicks) ? bootMs + startTicks * MS_PER_CLOCK_TICK : null,
      sessionId: uid === undefined ? null : Number(uid)
    }
  } catch {
    return null
  }
}

export interface LinuxPortAdapterOptions {
  /** Always read, because a row's session is judged against GitDeck's own. */
  readonly ownPid: number
  readonly run?: PortCommandRunner
  readonly read?: ProcReader
}

export const createLinuxPortAdapter = ({
  ownPid,
  run = createPortCommandRunner(),
  read = (path) => readFileSync(path, 'utf8')
}: LinuxPortAdapterOptions): PortAdapter => ({
  inspect: async (): Promise<PortInspection> => {
    const outcome = await run(SS, SS_ARGS, {
      timeoutMs: INSPECT_TIMEOUT_MS,
      maxOutputBytes: MAX_INSPECTION_OUTPUT_BYTES
    })

    switch (outcome.kind) {
      case 'ok': {
        const bindings = parseSsOutput(outcome.stdout)
        const bootSeconds = Number(/^btime (\d+)/m.exec(read('/proc/stat'))?.[1])
        const pids = new Set([ownPid, ...bindings.map(({ pid }) => pid)])
        return {
          bindings,
          processes: [...pids].flatMap((pid) => readIdentity(pid, read, bootSeconds * 1000) ?? [])
        }
      }
      case 'timeout':
        throw new PortInspectionTimeoutError(INSPECT_TIMEOUT_MS)
      case 'oversized':
        throw new PortInspectionError('output exceeded the size limit')
      case 'spawn-failed':
        throw new PortInspectionError(`ss could not be started (${outcome.reason})`)
      case 'exit':
        throw new PortInspectionError(`ss failed (exit ${outcome.code})`)
    }
  },

  terminate: async (pid: number): Promise<PortTerminationOutcome> => {
    // PID 1 is init, and a non-positive PID would signal a process group.
    if (!Number.isInteger(pid) || pid <= 1) {
      throw new PortTerminationError(`refused to run kill against pid ${pid}`)
    }

    // SIGKILL matches `taskkill /F`: `PortService` checks the port is released
    // right after this returns, and a handler for SIGTERM could still hold it.
    const outcome = await run(KILL, ['-KILL', String(pid)], {
      timeoutMs: KILL_TIMEOUT_MS,
      maxOutputBytes: MAX_KILL_OUTPUT_BYTES
    })

    switch (outcome.kind) {
      case 'ok':
        return 'terminated'
      case 'timeout':
        throw new PortTerminationError('kill did not finish in time')
      case 'oversized':
        throw new PortTerminationError('kill produced unexpected output')
      case 'spawn-failed':
        throw new PortTerminationError(`kill could not be started (${outcome.reason})`)
      case 'exit': {
        const text = `${outcome.stderr} ${outcome.stdout}`
        if (/no such process/i.test(text)) return 'already-exited'
        if (/not permitted/i.test(text)) throw new PortAccessDeniedError()
        throw new PortTerminationError(`kill exited ${outcome.code}`)
      }
    }
  }
})
