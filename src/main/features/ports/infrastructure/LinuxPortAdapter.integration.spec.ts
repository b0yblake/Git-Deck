import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { afterEach, describe, expect, it } from 'vitest'
import { createFakeLogger } from '@main/testing/FakeLogger'
import { PortService } from '../application/PortService'
import { createLinuxPortAdapter } from './LinuxPortAdapter'

const SERVER = `require('net').createServer().listen(0, '127.0.0.1', function () {
  console.log(this.address().port)
})`

describe.runIf(process.platform === 'linux')('against the real operating system', () => {
  let child: ChildProcess | undefined

  afterEach(() => {
    child?.kill('SIGKILL')
  })

  it('lists a real listener, terminates it and proves the port was released', async () => {
    child = spawn(process.execPath, ['-e', SERVER], { stdio: ['ignore', 'pipe', 'inherit'] })
    const [chunk] = (await once(child.stdout!, 'data')) as [Buffer]
    const port = Number(chunk.toString())

    const service = new PortService(
      createLinuxPortAdapter({ ownPid: process.pid }),
      createFakeLogger(),
      { ownPid: process.pid }
    )
    const snapshot = await service.list()
    const row = snapshot.processes.find(({ bindings }) =>
      bindings.some(({ localPort }) => localPort === port)
    )

    expect(row?.pid).toBe(child.pid)
    expect(row?.canTerminate).toBe(true)

    const result = await service.terminate({
      snapshotId: snapshot.id,
      targetIds: [row?.targetId ?? '']
    })

    expect(result.failures).toEqual([])
    expect(result.terminatedTargetIds).toEqual([row?.targetId])
  })
})
