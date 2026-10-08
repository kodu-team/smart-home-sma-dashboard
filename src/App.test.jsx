import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';

function cloudTime(offsetSeconds = 0) {
  return new Date(Date.now() + 7 * 60 * 60 * 1000 + offsetSeconds * 1000).toISOString().replace(/[-:]/g, '').slice(0, 15);
}

function sampleRecord({ lampMode = 0, blowerMode = 0, lamp = 'OFF', id = '', result = '', ageSeconds = 0 } = {}) {
  return {
    createdAt: cloudTime(-ageSeconds),
    payload: {
      ts: '2026-09-30T14:30:00+07:00',
      sensor: { temperature: 29.5, humidity: 67, active_power: 125.4 },
      contact: { window: 'OPEN' },
      actuator: { lamp, blower: 'OFF', door_lock: 'LOCK' },
      lamp_config: { mode: lampMode, on: '18:00', off: '06:00' },
      blower_config: { mode: blowerMode, threshold: 33, hysteresis: 1 },
      system: { wifi: 'CONNECTED', rssi: -61, rtc_valid: 1, last_command_id: id, last_command_result: result },
    },
  };
}

function renderApp(client, pollInterval = 5000) {
  return render(<App client={client} pollInterval={pollInterval} />);
}

describe('dashboard React', () => {
  it('menampilkan sensor dan kontrol manual dari telemetry', async () => {
    const client = { latestTelemetry: vi.fn(async () => sampleRecord()), sendCommand: vi.fn() };
    renderApp(client);
    expect(await screen.findByText('29.5')).toBeTruthy();
    expect(screen.getByText('125.4')).toBeTruthy();
    const lamp = screen.getByRole('region', { name: 'Lampu' });
    expect(within(lamp).getByRole('button', { name: 'Nyalakan' })).toBeTruthy();
    expect(screen.getByText('Terbuka')).toBeTruthy();
    expect(screen.getAllByRole('region', { name: /^Lampu/ })).toHaveLength(1);
    expect(screen.queryByText('Pintu', { exact: true })).toBeNull();
    expect(screen.getByText('Jendela', { exact: true })).toBeTruthy();
    expect(screen.getByText('Relay · GPIO 17')).toBeTruthy();
  });

  it('mode jadwal dan suhu menyembunyikan kontrol manual', async () => {
    const client = { latestTelemetry: vi.fn(async () => sampleRecord({ lampMode: 1, blowerMode: 1, lamp: 'ON' })), sendCommand: vi.fn() };
    renderApp(client);
    await screen.findByRole('button', { name: /Simpan jadwal/ });
    const lamp = screen.getByRole('region', { name: 'Lampu' });
    expect(within(lamp).queryByRole('button', { name: 'Nyalakan' })).toBeNull();
    expect(within(lamp).queryByRole('button', { name: 'Matikan' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Matikan Sekarang' })).toBeNull();
    const blower = screen.getByRole('region', { name: 'Blower' });
    expect(within(blower).getByText(/Nyala ≥ 33.0 °C/)).toBeTruthy();
    expect(within(blower).getByText(/Mati ≤ 32.0 °C/)).toBeTruthy();
  });

  it('menahan command berikutnya hingga telemetry mengakui ID', async () => {
    let current = sampleRecord();
    const client = { latestTelemetry: vi.fn(async () => current), sendCommand: vi.fn(async () => {}) };
    renderApp(client, 40);
    await screen.findAllByRole('button', { name: 'Nyalakan' });
    const lamp = screen.getByRole('region', { name: 'Lampu' });
    await userEvent.click(within(lamp).getByRole('button', { name: 'Nyalakan' }));
    await waitFor(() => expect(client.sendCommand).toHaveBeenCalledTimes(1));
    expect(client.sendCommand.mock.calls[0][0]).toMatchObject({ type: 'control', lamp: 'ON' });
    expect(within(lamp).getByText('OFF')).toBeTruthy();
    expect(within(lamp).getByRole('button', { name: 'Matikan' }).disabled).toBe(true);
    const id = client.sendCommand.mock.calls[0][0].id;
    current = sampleRecord({ lamp: 'ON', id, result: 'applied' });
    expect(await screen.findByText('Command diterapkan oleh ESP32.')).toBeTruthy();
    expect(within(lamp).getByText('ON')).toBeTruthy();
    expect(within(lamp).getByRole('button', { name: 'Matikan' }).disabled).toBe(false);
  });

  it.each([
    ['ignored', 'Command diterima tetapi diabaikan oleh mode perangkat saat ini.'],
    ['rejected', 'Command ditolak oleh ESP32. Periksa nilai pengaturan.'],
  ])('menampilkan hasil command %s dari telemetry', async (result, message) => {
    let current = sampleRecord();
    const client = { latestTelemetry: vi.fn(async () => current), sendCommand: vi.fn(async () => {}) };
    renderApp(client, 40);
    await screen.findAllByRole('button', { name: 'Nyalakan' });
    const lamp = screen.getByRole('region', { name: 'Lampu' });
    await userEvent.click(within(lamp).getByRole('button', { name: 'Nyalakan' }));
    const id = client.sendCommand.mock.calls[0][0].id;
    current = sampleRecord({ id, result });
    expect(await screen.findByText(message)).toBeTruthy();
    expect(within(lamp).getByText('OFF')).toBeTruthy();
  });

  it('menampilkan data kedaluwarsa dan menonaktifkan kontrol', async () => {
    const client = { latestTelemetry: vi.fn(async () => sampleRecord({ ageSeconds: 40 })), sendCommand: vi.fn() };
    renderApp(client);
    expect(await screen.findByText('Data perangkat kedaluwarsa')).toBeTruthy();
    const lamp = screen.getByRole('region', { name: 'Lampu' });
    expect(within(lamp).getByRole('button', { name: 'Nyalakan' }).disabled).toBe(true);
  });

  it('menampilkan kesalahan jaringan dari proksi', async () => {
    const client = { latestTelemetry: vi.fn(async () => { throw new Error('Network error'); }), sendCommand: vi.fn() };
    renderApp(client);
    expect(await screen.findByText('Telemetry tidak dapat diperbarui')).toBeTruthy();
  });

  it('mengirim perubahan mode pada field lamp', async () => {
    const client = { latestTelemetry: vi.fn(async () => sampleRecord()), sendCommand: vi.fn(async () => {}) };
    renderApp(client);
    const lamp = await screen.findByRole('region', { name: 'Lampu' });
    await waitFor(() => expect(within(lamp).getByRole('combobox').disabled).toBe(false));
    await userEvent.selectOptions(within(lamp).getByRole('combobox'), '1');
    expect(client.sendCommand).toHaveBeenCalledWith(expect.objectContaining({ type: 'config', lamp: { mode: 1 } }));
  });

  it('memvalidasi lalu mengirim jadwal lampu lintas tengah malam', async () => {
    const client = { latestTelemetry: vi.fn(async () => sampleRecord({ lampMode: 1 })), sendCommand: vi.fn(async () => {}) };
    renderApp(client);
    const save = await screen.findByRole('button', { name: /Simpan jadwal/ });
    const on = screen.getByLabelText('Waktu nyala');
    const off = screen.getByLabelText('Waktu mati');
    fireEvent.change(on, { target: { value: '22:00' } });
    fireEvent.change(off, { target: { value: '22:00' } });
    await userEvent.click(save);
    expect(await screen.findByText('Waktu nyala dan mati harus berbeda.')).toBeTruthy();
    expect(client.sendCommand).not.toHaveBeenCalled();
    fireEvent.change(off, { target: { value: '05:00' } });
    await userEvent.click(save);
    expect(client.sendCommand).toHaveBeenCalledWith(expect.objectContaining({ type: 'config', lamp: { on: '22:00', off: '05:00' } }));
  });

  it.each(['legacy', 'missingStatus', 'badSchedule', 'badMode'])('menonaktifkan kontrol lampu untuk telemetry %s', async scenario => {
    const record = sampleRecord();
    if (scenario === 'legacy') {
      record.payload.actuator = { lamp1: 'ON', lamp2: 'OFF', blower: 'OFF', door_lock: 'LOCK' };
      record.payload.lamp1_config = record.payload.lamp_config;
      delete record.payload.lamp_config;
    }
    if (scenario === 'missingStatus') delete record.payload.actuator.lamp;
    if (scenario === 'badSchedule') record.payload.lamp_config.off = '18:00';
    if (scenario === 'badMode') record.payload.lamp_config.mode = 2;
    const client = { latestTelemetry: vi.fn(async () => record), sendCommand: vi.fn() };
    renderApp(client);
    await screen.findByText('29.5');
    const lamp = screen.getByRole('region', { name: 'Lampu' });
    expect(within(lamp).getByRole('combobox').disabled).toBe(true);
    for (const button of within(lamp).queryAllByRole('button')) {
      expect(button.disabled).toBe(true);
      await userEvent.click(button);
    }
    expect(client.sendCommand).not.toHaveBeenCalled();
    expect(within(screen.getByRole('region', { name: 'Kunci pintu' })).getByRole('button', { name: 'Kunci' }).disabled).toBe(false);
  });
});
