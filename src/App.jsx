import { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowRight, CheckCircle2, CloudOff, Droplets, Fan, Gauge,
  House, LampDesk, LockKeyhole, RefreshCw, Thermometer,
  Wifi, Wind, XCircle,
} from 'lucide-react';
import { createDashboardClient } from './api/dashboard.js';
import {
  commandResult, connectionStatus, lampTelemetryValid, makeCommand, POLL_INTERVAL_MS,
  telemetryTime, validateSchedule, validateThreshold,
} from './domain/dashboard.js';

const resultMessages = {
  applied: 'Command diterapkan oleh ESP32.',
  ignored: 'Command diterima tetapi diabaikan oleh mode perangkat saat ini.',
  rejected: 'Command ditolak oleh ESP32. Periksa nilai pengaturan.',
  unknown: 'ESP32 merespons, tetapi hasil command tidak dikenal.',
};

function formatTime(value) {
  if (!value) return 'Belum ada data';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(value);
}

function numeric(value, digits = 1) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
}

function StateBadge({ value, good, labels }) {
  const known = value === labels[0] || value === labels[1];
  return <span className={`state-badge ${!known ? 'neutral' : value === good ? 'positive' : 'warning'}`}>
    <span className="state-dot" />{known ? value : 'TIDAK DIKETAHUI'}
  </span>;
}

function MetricCard({ icon: Icon, label, value, unit, hint, tone = 'blue', className = '' }) {
  return <div className={`metric-card tone-${tone} ${className}`}>
    <div className="metric-top"><span className="metric-icon"><Icon size={20} strokeWidth={2} /></span><span className="metric-label">{label}</span></div>
    <div className="metric-value">{value}<span className="metric-unit">{unit}</span></div>
    <div className="metric-hint">{hint}</div>
  </div>;
}

function ContactCard({ icon: Icon, label, value, hint }) {
  return <MetricCard icon={Icon} label={label}
    value={value === 'OPEN' ? 'Terbuka' : value === 'CLOSED' ? 'Tertutup' : '—'}
    hint={hint} tone={value === 'OPEN' ? 'orange' : value === 'CLOSED' ? 'green' : 'blue'}
    className="contact-metric" />;
}

function ActionButton({ active, disabled, children, onClick, variant = 'default' }) {
  return <button type="button" className={`action-button ${active ? 'selected' : ''} ${variant}`} disabled={disabled} onClick={onClick}>{children}</button>;
}

function LampCard({ status, config, send, disabled }) {
  const key = 'lamp';
  const mode = config?.mode === 0 || config?.mode === 1 ? config.mode : undefined;
  const [on, setOn] = useState(config?.on ?? '18:00');
  const [off, setOff] = useState(config?.off ?? '06:00');
  const [error, setError] = useState('');

  useEffect(() => { if (config?.on) setOn(config.on); }, [config?.on]);
  useEffect(() => { if (config?.off) setOff(config.off); }, [config?.off]);

  function saveSchedule(event) {
    event.preventDefault();
    const message = validateSchedule(on, off);
    setError(message ?? '');
    if (!message) send('config', { [key]: { on, off } }, 'Jadwal Lampu');
  }

  return <section className="device-card" aria-label="Lampu">
    <div className="device-heading"><span className="device-icon lamp"><LampDesk size={22} /></span><div><h3>Lampu</h3><p>Relay · GPIO 17</p></div><StateBadge value={status} good="ON" labels={['ON', 'OFF']} /></div>
    <div className="card-divider" />
    <label className="field-label" htmlFor="lamp-mode">Mode operasi</label>
    <select id="lamp-mode" value={mode === 0 || mode === 1 ? mode : ''} disabled={disabled || mode == null} onChange={event => send('config', { [key]: { mode: Number(event.target.value) } }, 'Mode Lampu')}>
      {mode == null && <option value="">Tidak tersedia</option>}
      <option value="0">Manual</option><option value="1">Jadwal harian</option>
    </select>
    {mode === 0 && <div className="control-section"><p className="section-caption">Kontrol manual</p><div className="button-pair">
      <ActionButton active={status === 'ON'} disabled={disabled} onClick={() => send('control', { [key]: 'ON' }, 'Nyalakan Lampu')}>Nyalakan</ActionButton>
      <ActionButton active={status === 'OFF'} disabled={disabled} onClick={() => send('control', { [key]: 'OFF' }, 'Matikan Lampu')}>Matikan</ActionButton>
    </div></div>}
    {mode === 1 && <div className="control-section"><p className="section-caption">Jadwal setiap hari · WIB</p><form onSubmit={saveSchedule}>
      <div className="time-grid"><label>Waktu nyala<input type="time" value={on} onChange={event => { setOn(event.target.value); setError(''); }} disabled={disabled} /></label><label>Waktu mati<input type="time" value={off} onChange={event => { setOff(event.target.value); setError(''); }} disabled={disabled} /></label></div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="save-button" disabled={disabled} type="submit">Simpan jadwal <ArrowRight size={16} /></button>
    </form>
    </div>}
  </section>;
}

function BlowerCard({ status, config, send, disabled }) {
  const mode = config?.mode;
  const [threshold, setThreshold] = useState(config?.threshold ?? 33);
  const [error, setError] = useState('');
  useEffect(() => { if (typeof config?.threshold === 'number') setThreshold(config.threshold); }, [config?.threshold]);
  const hysteresis = typeof config?.hysteresis === 'number' ? config.hysteresis : 1;

  function saveThreshold(event) {
    event.preventDefault();
    const message = validateThreshold(threshold, hysteresis);
    setError(message ?? '');
    if (!message) send('config', { blower: { threshold: Number(threshold) } }, 'Threshold blower');
  }

  return <section className="device-card" aria-label="Blower">
    <div className="device-heading"><span className="device-icon blower"><Fan size={22} /></span><div><h3>Blower</h3><p>Relay · GPIO 12</p></div><StateBadge value={status} good="ON" labels={['ON', 'OFF']} /></div>
    <div className="card-divider" />
    <label className="field-label" htmlFor="blower-mode">Mode operasi</label>
    <select id="blower-mode" value={mode === 0 || mode === 1 ? mode : ''} disabled={disabled || mode == null} onChange={event => send('config', { blower: { mode: Number(event.target.value) } }, 'Mode blower')}>
      {mode == null && <option value="">Tidak tersedia</option>}
      <option value="0">Manual</option><option value="1">Berdasarkan suhu</option>
    </select>
    {mode === 0 && <div className="control-section"><p className="section-caption">Kontrol manual</p><div className="button-pair">
      <ActionButton active={status === 'ON'} disabled={disabled} onClick={() => send('control', { blower: 'ON' }, 'Nyalakan blower')}>Nyalakan</ActionButton>
      <ActionButton active={status === 'OFF'} disabled={disabled} onClick={() => send('control', { blower: 'OFF' }, 'Matikan blower')}>Matikan</ActionButton>
    </div></div>}
    {mode === 1 && <div className="control-section"><p className="section-caption">Otomasi suhu</p><form onSubmit={saveThreshold}>
      <label className="threshold-label">Threshold nyala (°C)<input type="number" min="10" max="60" step="0.1" value={threshold} onChange={event => { setThreshold(event.target.value); setError(''); }} disabled={disabled} /></label>
      <div className="rule-box"><span><Thermometer size={15} /> Nyala ≥ {numeric(Number(config?.threshold))} °C</span><span><Wind size={15} /> Mati ≤ {numeric(Number(config?.threshold) - hysteresis)} °C</span></div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="save-button" disabled={disabled} type="submit">Simpan threshold <ArrowRight size={16} /></button>
    </form></div>}
  </section>;
}

function LockCard({ status, send, disabled }) {
  return <section className="device-card" aria-label="Kunci pintu">
    <div className="device-heading"><span className="device-icon lock"><LockKeyhole size={22} /></span><div><h3>Kunci pintu</h3><p>Servo SG90 · GPIO 25</p></div><StateBadge value={status} good="LOCK" labels={['LOCK', 'UNLOCK']} /></div>
    <div className="card-divider" /><p className="section-caption">Kontrol akses</p>
    <div className="button-pair"><ActionButton active={status === 'LOCK'} disabled={disabled} onClick={() => send('control', { door_lock: 'LOCK' }, 'Kunci pintu')}>Kunci</ActionButton><ActionButton active={status === 'UNLOCK'} disabled={disabled} onClick={() => send('control', { door_lock: 'UNLOCK' }, 'Buka kunci pintu')}>Buka kunci</ActionButton></div>
    <p className="card-note">Status mengikuti telemetry ESP32, termasuk perubahan melalui RFID.</p>
  </section>;
}

export default function App({ client: providedClient, pollInterval = POLL_INTERVAL_MS }) {
  const [client] = useState(() => providedClient || createDashboardClient());
  const [record, setRecord] = useState(null);
  const [fetchError, setFetchError] = useState('');
  const [pending, setPending] = useState(null);
  const [notice, setNotice] = useState(null);
  const [now, setNow] = useState(Date.now());
  const busyRef = useRef(false);

  useEffect(() => {
    if (!client) return;
    let active = true;
    let inFlight = false;
    async function poll() {
      if (inFlight) return;
      inFlight = true;
      setNow(Date.now());
      try {
        const next = await client.latestTelemetry();
        if (active) { setRecord(next); setFetchError(''); setNow(Date.now()); }
      } catch (error) {
        if (active) setFetchError(error.message || 'Gagal mengambil telemetry.');
      } finally { inFlight = false; }
    }
    poll();
    const timer = setInterval(poll, pollInterval);
    return () => { active = false; clearInterval(timer); };
  }, [client, pollInterval]);

  useEffect(() => {
    if (!pending) return;
    const result = commandResult(record, pending.id);
    if (!result) return;
    busyRef.current = false;
    setPending(null);
    setNotice({ kind: result, text: resultMessages[result] });
  }, [record, pending]);

  const status = connectionStatus(record, now);
  const disabled = status !== 'online' || Boolean(pending);

  async function send(type, changes, label) {
    if (!client || busyRef.current || status !== 'online') return;
    const command = makeCommand(type, changes);
    busyRef.current = true;
    setPending({ id: command.id, label });
    setNotice(null);
    try {
      await client.sendCommand(command);
      // Perintah berikutnya menunggu ID ini muncul pada telemetry.
    } catch (error) {
      busyRef.current = false;
      setPending(null);
      setNotice({ kind: 'error', text: error.message || 'Gagal mengirim command.' });
    }
  }

  const data = record?.payload;
  const lastUpdate = telemetryTime(record);
  const statusLabel = status === 'online' ? 'Online' : status === 'stale' ? 'Data kedaluwarsa' : 'Menunggu data';

  return <div className="app-shell">
    <header className="topbar"><div className="topbar-inner"><div className="brand-mark"><House size={21} strokeWidth={2.2} /></div><div className="brand-name">SMART<span>HOME</span><small>DASHBOARD</small></div><div className="topbar-right"><span className={`connection-pill ${status}`}><span className="live-dot" />{statusLabel}</span></div></div></header>
    <main className="page-content">
      <section className="hero"><div><p className="eyebrow">MONITORING & KONTROL</p><h1>Selamat datang di<br /><span>Dashboard Smart Home</span></h1><p className="hero-description">Pantau sensor dan kendalikan perangkat Smart Home secara langsung melalui Antares.</p><div className="last-update"><Activity size={16} /><span>Pembaruan terakhir: <strong>{lastUpdate ? `${formatTime(lastUpdate)} WIB` : 'Belum ada data'}</strong></span></div></div><div className="hero-visual" aria-hidden="true"><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="hero-house"><House size={78} strokeWidth={1.25} /><span className="hero-signal signal-one" /><span className="hero-signal signal-two" /></div><span className="visual-label label-one"><Thermometer size={14} /> Sensor</span><span className="visual-label label-two"><Wifi size={14} /> Terhubung</span></div></section>

      {fetchError && <div className="alert-banner error" role="alert"><CloudOff size={19} /><div><strong>Telemetry tidak dapat diperbarui</strong><span>{fetchError} Dashboard akan mencoba lagi otomatis.</span></div></div>}
      {status === 'stale' && <div className="alert-banner stale" role="status"><CloudOff size={19} /><div><strong>Data perangkat kedaluwarsa</strong><span>Data terakhir berumur lebih dari 20 detik. Kontrol dinonaktifkan sampai telemetry terbaru diterima.</span></div></div>}
      {pending && <div className="alert-banner pending" role="status"><RefreshCw className="spin" size={19} /><div><strong>Menunggu konfirmasi ESP32</strong><span>{pending.label} dikirim ke Antares. Status perangkat akan berubah setelah telemetry mengonfirmasinya.</span></div></div>}
      {notice && <div className={`alert-banner ${notice.kind === 'applied' ? 'success' : 'error'}`} role="status">{notice.kind === 'applied' ? <CheckCircle2 size={19} /> : <XCircle size={19} />}<div><strong>{notice.kind === 'applied' ? 'Selesai' : 'Perhatian'}</strong><span>{notice.text}</span></div><button type="button" onClick={() => setNotice(null)} aria-label="Tutup pemberitahuan">×</button></div>}

      <section className="section-block"><div className="section-heading"><div><p className="eyebrow">TELEMETRY</p><h2>Ringkasan sensor</h2></div><span className="section-side"><span className="small-live-dot" />Diperbarui setiap 5 detik</span></div>
        <div className="metrics-grid"><MetricCard icon={Thermometer} label="Suhu ruangan" value={numeric(data?.sensor?.temperature)} unit="°C" hint="Sensor DHT11" tone="orange" /><MetricCard icon={Droplets} label="Kelembaban" value={numeric(data?.sensor?.humidity)} unit="%" hint="Sensor DHT11" tone="blue" /><MetricCard icon={Gauge} label="Daya aktif" value={numeric(data?.sensor?.active_power)} unit="W" hint="Sensor HLW8012" tone="purple" /><ContactCard icon={Wind} label="Jendela" value={data?.contact?.window} hint="Magnetic reed switch" /></div>
      </section>

      <section className="section-block devices-block"><div className="section-heading"><div><p className="eyebrow">COMMANDS</p><h2>Kontrol perangkat</h2></div><span className="section-side">Perubahan dikonfirmasi lewat telemetry <ArrowRight size={16} /></span></div>
        <div className="device-grid"><LampCard status={data?.actuator?.lamp} config={data?.lamp_config} send={send} disabled={disabled || !lampTelemetryValid(data)} /><BlowerCard status={data?.actuator?.blower} config={data?.blower_config} send={send} disabled={disabled} /><LockCard status={data?.actuator?.door_lock} send={send} disabled={disabled} /></div>
      </section>

      <footer className="footer"><div><span className="footer-logo"><House size={17} /> SMART HOME</span></div><div className="footer-system"><span>Wi-Fi: {data?.system?.wifi ?? '—'}</span><span>RSSI: {typeof data?.system?.rssi === 'number' ? `${data.system.rssi} dBm` : '—'}</span><span>RTC: {data?.system?.rtc_valid === 1 ? 'Siap' : 'Belum valid'}</span></div></footer>
    </main>
  </div>;
}
