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
    const command = { id: 'abc', type: 'control', lamp: 'ON' };
    const response = await fetch(`${url}/api/commands`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
    expect(response.status).toBe(202);
    expect(client.sendCommand).toHaveBeenCalledWith(command);
    const bad = await fetch(`${url}/api/commands`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...command, lamp: 'INVALID' }) });
    expect(bad.status).toBe(400);
    expect(client.sendCommand).toHaveBeenCalledTimes(1);
  });

  it('menolak field di luar kontrak command', () => {
    expect(() => validateCommand({ id: 'abc', type: 'control', wifi: 'secret' })).toThrow();
    expect(() => validateCommand({ id: 'abc', type: 'config', lamp: { mode: 1, on: '18:00', off: '18:00' } })).toThrow();
    expect(validateCommand({ id: 'abc', type: 'config', blower: { threshold: 35 } })).toMatchObject({ id: 'abc' });
  });

  it.each([
    { type: 'control', lamp1: 'ON' },
    { type: 'control', lamp2: 'OFF' },
    { type: 'control', lamp: 'ON', lamp1: 'OFF', door_lock: 'UNLOCK' },
    { type: 'control', lamp: 'ON', door: 'OPEN' },
    { type: 'config', lamp: { mode: 1 }, lamp2: { mode: 0 } },
    { type: 'config', lamp: { mode: 1, door: 'OPEN' }, blower: { mode: 1 } },
    { type: 'config', lamp: { mode: 1 }, blower: { threshold: 35, extra: true } },
    { type: 'config', lamp: { mode: 1 }, door_lock: 'UNLOCK' },
  ])('menolak payload lama/asing tanpa meneruskannya: %j', async changes => {
    const client = { sendCommand: vi.fn(async () => {}) };
    const url = await openApp(client);
    const response = await fetch(`${url}/api/commands`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'old-command', ...changes }),
    });
    expect(response.status).toBe(400);
    expect(client.sendCommand).not.toHaveBeenCalled();
  });

  it('meneruskan konfigurasi lampu baru dan kontrol servo/blower', async () => {
    const client = { sendCommand: vi.fn(async () => {}) };
    const url = await openApp(client);
    const commands = [
      { id: 'config', type: 'config', lamp: { mode: 1, on: '22:00', off: '05:00' }, blower: { mode: 1, threshold: 35, hysteresis: 1 } },
      { id: 'control', type: 'control', lamp: 'NONE', blower: 'ON', door_lock: 'UNLOCK' },
    ];
    for (const command of commands) {
      const response = await fetch(`${url}/api/commands`, { method: 'POST', body: JSON.stringify(command) });
      expect(response.status).toBe(202);
      expect(client.sendCommand).toHaveBeenLastCalledWith(command);
    }
  });
});
