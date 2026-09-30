// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, validateCommand } from './app.js';

const servers = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve)))); });

async function openApp(client) {
  const server = createApp({ dist: 'dist' }, client);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

describe('proksi Node', () => {
  it('mengembalikan telemetry tanpa mengekspos access key', async () => {
    const client = { latestTelemetry: vi.fn(async () => ({ payload: { sensor: { temperature: 30 } }, createdAt: '20260930T110000' })) };
    const url = await openApp(client);
    const response = await fetch(`${url}/api/telemetry`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ payload: { sensor: { temperature: 30 } }, createdAt: '20260930T110000' });
  });

  it('memvalidasi dan mengirim satu command ke Antares', async () => {
    const client = { sendCommand: vi.fn(async () => {}) };
    const url = await openApp(client);
    const command = { id: 'abc', type: 'control', lamp1: 'ON' };
    const response = await fetch(`${url}/api/commands`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
    expect(response.status).toBe(202);
    expect(client.sendCommand).toHaveBeenCalledWith(command);
    const bad = await fetch(`${url}/api/commands`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...command, lamp1: 'INVALID' }) });
    expect(bad.status).toBe(400);
    expect(client.sendCommand).toHaveBeenCalledTimes(1);
  });

  it('menolak field di luar kontrak command', () => {
    expect(() => validateCommand({ id: 'abc', type: 'control', wifi: 'secret' })).toThrow();
    expect(() => validateCommand({ id: 'abc', type: 'config', lamp1: { mode: 1, on: '18:00', off: '18:00' } })).toThrow();
    expect(validateCommand({ id: 'abc', type: 'config', blower: { threshold: 35 } })).toMatchObject({ id: 'abc' });
  });
});
