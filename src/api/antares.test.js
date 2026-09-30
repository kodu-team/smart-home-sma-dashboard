import { describe, expect, it, vi } from 'vitest';
import { createAntaresClient, parseContentInstance } from './antares.js';

const config = {
  baseUrl: 'https://platform.antares.id:8443', accessKey: 'test-key',
  project: 'smart-home-sma', telemetryDevice: 'smarthome-telemetry', commandsDevice: 'smarthome-commands',
};

describe('Antares API', () => {
  it('membaca m2m:cin.con sebagai JSON dan mempertahankan waktu cloud', () => {
    expect(parseContentInstance({ 'm2m:cin': { con: '{"sensor":{"temperature":29.5}}', ct: '20260930T090000' } })).toEqual({
      payload: { sensor: { temperature: 29.5 } }, createdAt: '20260930T090000',
    });
    expect(() => parseContentInstance({ 'm2m:cin': { con: '{' } })).toThrow('bukan JSON');
    expect(() => parseContentInstance({})).toThrow('Format respons');
  });

  it('mengambil telemetry terbaru dengan header Antares', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ 'm2m:cin': { con: '{"ts":""}' } }) }));
    const client = createAntaresClient(config, fetchImpl);
    expect(await client.latestTelemetry()).toEqual({ payload: { ts: '' }, createdAt: null });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://platform.antares.id:8443/~/antares-cse/antares-id/smart-home-sma/smarthome-telemetry/la');
    expect(fetchImpl.mock.calls[0][1].headers['X-M2M-Origin']).toBe('test-key');
  });

  it('menyimpan command sebagai string JSON di m2m:cin.con', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    const command = { id: 'abc', type: 'control', lamp1: 'ON' };
    await createAntaresClient(config, fetchImpl).sendCommand(command);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url.endsWith('/smarthome-commands')).toBe(true);
    expect(options.method).toBe('POST');
    expect(JSON.parse(JSON.parse(options.body)['m2m:cin'].con)).toEqual(command);
  });

  it('melaporkan kegagalan HTTP', async () => {
    const client = createAntaresClient(config, async () => ({ ok: false, status: 403 }));
    await expect(client.latestTelemetry()).rejects.toThrow('Access key Antares ditolak');
    await expect(client.sendCommand({})).rejects.toThrow('HTTP 403');
  });

  it('menjelaskan timeout dan kegagalan jaringan secara spesifik', async () => {
    const timeout = Object.assign(new Error('signal timed out'), { name: 'TimeoutError' });
    const slow = createAntaresClient(config, async () => { throw timeout; });
    await expect(slow.latestTelemetry()).rejects.toThrow('batas waktu 25 detik');
    const blocked = createAntaresClient(config, async () => { throw new TypeError('Failed to fetch'); });
    await expect(blocked.latestTelemetry()).rejects.toThrow('izin CORS');
  });
});
