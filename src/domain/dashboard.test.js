import { describe, expect, it } from 'vitest';
import {
  commandResult, connectionStatus, lampTelemetryValid, makeCommand, parseAntaresTime,
  validateSchedule, validateThreshold,
} from './dashboard.js';

describe('aturan dashboard', () => {
  it('membaca waktu Antares WIB dan menandai data yang berumur lebih dari 20 detik', () => {
    const now = Date.UTC(2026, 8, 30, 4, 43, 0);
    expect(parseAntaresTime('20260930T114249')?.toISOString()).toBe('2026-09-30T04:42:49.000Z');
    expect(connectionStatus({ createdAt: '20260930T114249', payload: {} }, now)).toBe('online');
    expect(connectionStatus({ createdAt: '20260930T114239', payload: {} }, now)).toBe('stale');
    expect(connectionStatus({ createdAt: '20260930T114305', payload: {} }, now)).toBe('online');
    expect(connectionStatus({ createdAt: '20260930T114400', payload: {} }, now)).toBe('stale');
    expect(connectionStatus(null, now)).toBe('unknown');
    expect(connectionStatus({ createdAt: null, payload: { ts: '2026-09-30T11:42:49+07:00' } }, now)).toBe('online');
  });

  it('memvalidasi jadwal harian dan threshold', () => {
    expect(validateSchedule('18:00', '06:00')).toBeNull();
    expect(validateSchedule('18:00', '18:00')).toMatch(/berbeda/);
    expect(validateSchedule('24:00', '06:00')).toMatch(/HH:MM/);
    expect(validateThreshold(33, 1)).toBeNull();
    expect(validateThreshold(9, 1)).toMatch(/10–60/);
    expect(validateThreshold(33, 0)).toMatch(/Hysteresis/);
  });

  it('memerlukan kontrak lampu baru yang lengkap sebelum kontrol aktif', () => {
    const payload = { actuator: { lamp: 'OFF' }, lamp_config: { mode: 1, on: '18:00', off: '06:00' } };
    expect(lampTelemetryValid(payload)).toBe(true);
    expect(lampTelemetryValid({ actuator: { lamp1: 'OFF' }, lamp1_config: payload.lamp_config })).toBe(false);
    expect(lampTelemetryValid({ ...payload, lamp_config: { ...payload.lamp_config, mode: '1' } })).toBe(false);
    expect(lampTelemetryValid({ ...payload, actuator: { lamp: 'UNKNOWN' } })).toBe(false);
    expect(lampTelemetryValid({ ...payload, lamp_config: { mode: 0 } })).toBe(false);
    expect(lampTelemetryValid(undefined)).toBe(false);
  });

  it('membuat command dan menunggu ID yang cocok sebelum mengakui hasil', () => {
    expect(makeCommand('control', { lamp: 'ON' }, 'abc')).toEqual({ id: 'abc', type: 'control', lamp: 'ON' });
    expect(() => makeCommand('control', {}, 'x'.repeat(64))).toThrow();
    const record = { payload: { system: { last_command_id: 'abc', last_command_result: 'applied' } } };
    expect(commandResult(record, 'other')).toBeNull();
    expect(commandResult(record, 'abc')).toBe('applied');
  });
});
