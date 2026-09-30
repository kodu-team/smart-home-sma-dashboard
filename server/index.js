import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAntaresClient } from '../src/api/antares.js';
import { createApp } from './app.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const config = {
  baseUrl: process.env.ANTARES_BASE_URL || 'https://platform.antares.id:8443',
  accessKey: process.env.ANTARES_ACCESS_KEY,
  project: process.env.ANTARES_PROJECT,
  telemetryDevice: process.env.ANTARES_TELEMETRY_DEVICE || 'smarthome-telemetry',
  commandsDevice: process.env.ANTARES_COMMANDS_DEVICE || 'smarthome-commands',
  dist: resolve('dist'),
};

if (!config.accessKey || config.accessKey === 'ISI_ACCESS_KEY_ANTARES' || !config.project) {
  console.error('Isi ANTARES_ACCESS_KEY dan ANTARES_PROJECT di .env.');
  process.exit(1);
}

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3001);
const server = createApp(config, createAntaresClient(config));
server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} sedang dipakai. Hentikan npm run dev atau server lain sebelum npm start.`);
  } else {
    console.error(`Server gagal dijalankan: ${error.message}`);
  }
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log(`Proksi Smart Home SMA aktif di http://${host}:${port}`);
});
