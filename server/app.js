import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 2048) throw new Error('Command terlalu panjang.');
  }
  try { return JSON.parse(body); }
  catch { throw new Error('JSON command tidak valid.'); }
}

export function validateCommand(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw new Error('Command tidak valid.');
  if (typeof command.id !== 'string' || !command.id || command.id.length > 63) throw new Error('ID command tidak valid.');
  if (command.type !== 'config' && command.type !== 'control') throw new Error('Tipe command tidak valid.');
  const allowed = command.type === 'config' ? ['id', 'type', 'lamp', 'blower'] : ['id', 'type', 'lamp', 'blower', 'door_lock'];
  if (Object.keys(command).some(key => !allowed.includes(key))) throw new Error('Field command tidak valid.');
  if (command.type === 'control') {
    for (const key of ['lamp', 'blower']) {
      if (command[key] != null && !['NONE', 'ON', 'OFF'].includes(command[key])) throw new Error(`${key} tidak valid.`);
    }
    if (command.door_lock != null && !['NONE', 'LOCK', 'UNLOCK'].includes(command.door_lock)) throw new Error('door_lock tidak valid.');
  } else {
    for (const key of ['lamp', 'blower']) {
      const value = command[key];
      if (value == null) continue;
      if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${key} tidak valid.`);
      const validKeys = key === 'blower' ? ['mode', 'threshold', 'hysteresis'] : ['mode', 'on', 'off'];
      if (Object.keys(value).some(field => !validKeys.includes(field))) throw new Error(`${key} tidak valid.`);
      if (value.mode != null && value.mode !== 0 && value.mode !== 1) throw new Error(`${key}.mode tidak valid.`);
      if (key === 'blower') {
        if (value.threshold != null && (typeof value.threshold !== 'number' || value.threshold < 10 || value.threshold > 60)) throw new Error('Threshold tidak valid.');
        if (value.hysteresis != null && (typeof value.hysteresis !== 'number' || value.hysteresis <= 0 || value.hysteresis > 10)) throw new Error('Hysteresis tidak valid.');
      } else {
        for (const field of ['on', 'off']) {
          if (value[field] != null && (typeof value[field] !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value[field]))) throw new Error(`Jadwal ${key} tidak valid.`);
        }
        if (value.on != null && value.on === value.off) throw new Error(`Jadwal ${key} harus berbeda.`);
      }
    }
  }
  return command;
}

export function createApp(config, client) {
  const dist = resolve(config.dist);
  let posting = false;

  return createServer(async (request, response) => {
    let pathname;
    try { pathname = new URL(request.url, 'http://localhost').pathname; }
    catch { json(response, 400, { error: 'URL tidak valid.' }); return; }

    if (pathname === '/api/telemetry' && request.method === 'GET') {
      try { json(response, 200, await client.latestTelemetry()); }
      catch (error) { json(response, 502, { error: error.message }); }
      return;
    }
    if (pathname === '/api/commands' && request.method === 'POST') {
      if (posting) { json(response, 409, { error: 'Command lain sedang dikirim.' }); return; }
      posting = true;
      try {
        const command = validateCommand(await readJson(request));
        await client.sendCommand(command);
        json(response, 202, { id: command.id });
      } catch (error) {
        json(response, /tidak valid|terlalu panjang|harus berbeda/.test(error.message) ? 400 : 502, { error: error.message });
      } finally { posting = false; }
      return;
    }
    if (pathname.startsWith('/api/')) { json(response, 404, { error: 'Endpoint tidak ditemukan.' }); return; }
    if (request.method !== 'GET' && request.method !== 'HEAD') { json(response, 405, { error: 'Method tidak didukung.' }); return; }

    try {
      const wanted = decodeURIComponent(pathname);
      const file = resolve(dist, '.' + (wanted === '/' ? '/index.html' : wanted));
      if (file !== dist && !file.startsWith(dist + sep)) throw new Error('Path tidak valid.');
      let target = file;
      try { if (!(await stat(target)).isFile()) throw new Error('File tidak ada.'); }
      catch {
        if (extname(wanted)) throw new Error('File tidak ada.');
        target = resolve(dist, 'index.html');
      }
      const content = await readFile(target);
      response.writeHead(200, { 'Content-Type': contentTypes[extname(target)] || 'application/octet-stream' });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch { json(response, 404, { error: 'Halaman tidak ditemukan. Jalankan npm run build.' }); }
  });
}
