export const POLL_INTERVAL_MS = 5000;
export const ONLINE_LIMIT_MS = 20000;
const CLOCK_SKEW_MS = 30000;

export function parseAntaresTime(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  // Antares pada project ini mengirim ct dalam WIB tanpa penanda zona waktu.
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function telemetryTime(record) {
  const cloudTime = parseAntaresTime(record?.createdAt);
  if (cloudTime) return cloudTime;
  const deviceTime = record?.payload?.ts;
  if (typeof deviceTime !== 'string' || !deviceTime) return null;
  const date = new Date(deviceTime);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function connectionStatus(record, now = Date.now()) {
  if (!record) return 'unknown';
  const time = telemetryTime(record);
  if (!time) return 'unknown';
  const age = now - time.getTime();
  return age >= -CLOCK_SKEW_MS && age <= ONLINE_LIMIT_MS ? 'online' : 'stale';
}

export function validTime(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(':').map(Number);
  return hours <= 23 && minutes <= 59;
}

export function validateSchedule(on, off) {
  if (!validTime(on) || !validTime(off)) return 'Gunakan waktu HH:MM yang valid.';
  if (on === off) return 'Waktu nyala dan mati harus berbeda.';
  return null;
}

export function lampTelemetryValid(payload) {
  const config = payload?.lamp_config;
  return ['ON', 'OFF'].includes(payload?.actuator?.lamp)
    && (config?.mode === 0 || config?.mode === 1)
    && validateSchedule(config.on, config.off) === null;
}

export function validateThreshold(value, hysteresis = 1) {
  const threshold = Number(value);
  if (!Number.isFinite(threshold) || threshold < 10 || threshold > 60) return 'Threshold harus 10–60 °C.';
  if (!Number.isFinite(hysteresis) || hysteresis <= 0 || hysteresis > 10 || hysteresis >= threshold) {
    return 'Hysteresis perangkat tidak valid.';
  }
  return null;
}

export function commandId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function makeCommand(type, changes, id = commandId()) {
  if (!id || id.length > 63) throw new Error('ID command tidak valid.');
  if (type !== 'config' && type !== 'control') throw new Error('Jenis command tidak valid.');
  return { id, type, ...changes };
}

export function commandResult(record, pendingId) {
  if (!pendingId || record?.payload?.system?.last_command_id !== pendingId) return null;
  const result = record.payload.system.last_command_result;
  return ['applied', 'ignored', 'rejected'].includes(result) ? result : 'unknown';
}
