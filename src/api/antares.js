const ROOT = '/~/antares-cse/antares-id';
const REQUEST_TIMEOUT_MS = 25000;

export function explainAntaresError(error, action, host = 'platform.antares.id:8443') {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return `Koneksi ke Antares melewati batas waktu 25 detik saat ${action}. Periksa akses HTTPS ke ${host} dari jaringan ini.`;
  }
  if (error instanceof TypeError) {
    return `Browser gagal terhubung ke Antares saat ${action}. Periksa jaringan, akses ke ${host}, dan izin CORS.`;
  }
  return error?.message || `Antares gagal saat ${action}.`;
}

function httpError(response, action) {
  if (response.status === 401 || response.status === 403) {
    return new Error(`Access key Antares ditolak saat ${action} (HTTP ${response.status}).`);
  }
  if (response.status === 404) {
    return new Error(`Project atau device Antares tidak ditemukan saat ${action} (HTTP 404).`);
  }
  return new Error(`Antares gagal saat ${action} (HTTP ${response.status}).`);
}

export function parseContentInstance(body) {
  const instance = body?.['m2m:cin'];
  if (!instance || typeof instance.con !== 'string') throw new Error('Format respons Antares tidak valid.');
  let payload;
  try {
    payload = JSON.parse(instance.con);
  } catch {
    throw new Error('Isi telemetry Antares bukan JSON yang valid.');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Isi telemetry Antares tidak valid.');
  }
  return { payload, createdAt: instance.ct ?? null };
}

export function createAntaresClient(config, fetchImpl = fetch) {
  const host = new URL(config.baseUrl).host;
  const url = (device, latest = false) =>
    `${config.baseUrl}${ROOT}/${encodeURIComponent(config.project)}/${encodeURIComponent(device)}${latest ? '/la' : ''}`;
  const headers = {
    'X-M2M-Origin': config.accessKey,
    'Content-Type': 'application/json;ty=4',
    Accept: 'application/json',
  };

  async function latestTelemetry() {
    try {
      const response = await fetchImpl(url(config.telemetryDevice, true), {
        method: 'GET', headers, cache: 'no-store', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw httpError(response, 'membaca telemetry');
      return parseContentInstance(await response.json());
    } catch (error) {
      throw new Error(explainAntaresError(error, 'membaca telemetry', host));
    }
  }

  async function sendCommand(command) {
    try {
      const response = await fetchImpl(url(config.commandsDevice), {
        method: 'POST',
        headers,
        body: JSON.stringify({ 'm2m:cin': { con: JSON.stringify(command) } }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw httpError(response, 'mengirim command');
    } catch (error) {
      throw new Error(explainAntaresError(error, 'mengirim command', host));
    }
  }

  return { latestTelemetry, sendCommand };
}
