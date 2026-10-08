import { describe, expect, it, vi } from 'vitest';
import { createDashboardClient } from './dashboard.js';

describe('API dashboard same-origin', () => {
  it('membaca telemetry dari proksi tanpa access key di browser', async () => {
    const record = { payload: { sensor: { temperature: 30 } }, createdAt: '20260930T110000' };
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => record }));
    expect(await createDashboardClient(fetchImpl).latestTelemetry()).toEqual(record);
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/telemetry');
    expect(fetchImpl.mock.calls[0][1].headers).toBeUndefined();
  });

  it('mengirim command ke proksi dan meneruskan error server', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'abc' }) }));
    const command = { id: 'abc', type: 'control', lamp: 'ON' };
    expect(await createDashboardClient(fetchImpl).sendCommand(command)).toEqual({ id: 'abc' });
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/commands');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual(command);
    const rejected = createDashboardClient(async () => ({ ok: false, status: 502, json: async () => ({ error: 'Antares tidak tersedia.' }) }));
    await expect(rejected.latestTelemetry()).rejects.toThrow('Antares tidak tersedia.');
  });
});
