async function readResponse(response) {
  let body;
  try { body = await response.json(); }
  catch { throw new Error('Respons proksi tidak valid. Periksa apakah server Node berjalan.'); }
  if (!response.ok) throw new Error(body?.error || `Proksi gagal (HTTP ${response.status}).`);
  return body;
}

export function createDashboardClient(fetchImpl = fetch) {
  return {
    async latestTelemetry() {
      const response = await fetchImpl('/api/telemetry', { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      return readResponse(response);
    },
    async sendCommand(command) {
      const response = await fetchImpl('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(30000),
      });
      return readResponse(response);
    },
  };
}
