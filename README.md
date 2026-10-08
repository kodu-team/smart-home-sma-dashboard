# Smart Home SMA — Dashboard v2

Dashboard React satu halaman untuk proyek [Smart Home SMA](../smart-home-sma). Browser mengakses proksi Node pada origin yang sama; proksi menghubungi [Antares HTTP API](https://docs.antares.id/api-or-http/data-of-device). Proksi diperlukan karena Antares menolak preflight CORS dari browser. Tidak ada login atau database.

## Persiapan

1. Pastikan firmware ESP32 memakai project dan dua device Antares yang sama dengan dashboard.
2. Salin `.env.example` menjadi `.env`. Isi `ANTARES_ACCESS_KEY`, lalu cocokkan project dan kedua nama device dengan `secrets.h` firmware. `.env` diabaikan Git dan dibaca hanya oleh Node. Konfigurasi lama di `public/config.local.js` tidak lagi digunakan.
3. Jalankan:

   ```powershell
   npm install
   npm run dev
   ```

4. Buka URL yang ditampilkan Vite (biasanya `http://127.0.0.1:5173`). Perintah `npm run dev` menjalankan proksi Node dan Vite bersama.

Untuk penggunaan hasil build, hentikan `npm run dev`, lalu jalankan `npm run build` dan `npm start`. Mode dev dan start sama-sama memakai port proksi 3001, jadi keduanya tidak dapat berjalan bersamaan. Node menyajikan `dist/` dan `/api` pada origin yang sama (default `http://127.0.0.1:3001`). Hasil `dist/` saja tidak dapat mengakses Antares tanpa proksi. Untuk akses dari tablet pada LAN tepercaya, atur `HOST="0.0.0.0"` di `.env`, lalu gunakan `npm start` dan alamat IP komputer pada port 3001.

## Perilaku

- Dashboard mengambil telemetry terbaru tiap 5 detik. Status **Online** hanya ditampilkan bila waktu pembuatan telemetry Antares berumur maksimal 20 detik. Jika data kedaluwarsa atau tidak tersedia, kontrol dinonaktifkan.
- Mode manual, jadwal, dan suhu berasal dari telemetry. Jadwal berlaku setiap hari dalam WIB; nilai ON dan OFF boleh melewati tengah malam dan harus berbeda.
- Setelah command dikirim, dashboard menunggu `system.last_command_id` pada telemetry cocok dengan ID command. Respons POST saja tidak dianggap sebagai perubahan status perangkat. Selama menunggu, command baru dinonaktifkan.
- Status lampu, blower, dan kunci selalu mengikuti `actuator` pada telemetry. Satu lampu memakai `actuator.lamp` dan `lamp_config`, dengan GPIO17 sesuai firmware. ON/OFF tersedia hanya dalam mode manual; pada mode jadwal, firmware mengabaikan ON maupun OFF manual.
- Kontak jendela tetap ditampilkan; kunci servo/RFID tetap tersedia melalui `door_lock`. State kunci adalah state servo, bukan posisi fisik buka/tutup pintu.
- Kontrol lampu membutuhkan telemetry kontrak baru: status ON/OFF, mode 0/1, dan jadwal HH:MM valid dengan waktu nyala/mati berbeda. Data lama atau invalid tidak diterjemahkan otomatis.
- Desktop >950px menampilkan tiga kartu perangkat; tablet 701–950px memakai dua kolom dengan kartu terakhir memenuhi baris; ponsel ≤700px memakai satu kolom. Ringkasan sensor memuat suhu, kelembaban, daya, dan status jendela dalam empat kartu sejajar pada desktop; tablet/ponsel memakai dua kolom.

## Kontrak dan transisi v2

Lihat [kontrak data firmware](../smart-home-sma/docs/data-contract.md) dan
[PRD](../smart-home-sma/PRD.md). Endpoint tetap GET `/api/telemetry` dan POST
`/api/commands`; project serta dua device Antares tetap sama.

Contoh command:

```json
{"id":"manual-v2","type":"control","lamp":"ON"}
```

```json
{"id":"schedule-v2","type":"config","lamp":{"mode":1,"on":"18:00","off":"06:00"}}
```

Dalam transisi v1 → v2, sensor pintu, otomasi pintu → lampu, lampu kedua, dan tombol
“Matikan Sekarang” dihapus. Field lama `contact.door`, `lamp1`, `lamp2`,
`lamp1_config`, dan `lamp2_config` tidak digunakan. Proksi dan firmware menolak
command dengan field lama/asing, termasuk payload campuran dan nested field asing.
Proksi mengembalikan HTTP 400 tanpa meneruskan command yang ditolak.

Hentikan dashboard/proksi lama, pasang firmware v2, dan pastikan telemetry baru
terbit sebelum menjalankan dashboard/proksi v2. Muat ulang browser agar pending
command dan bundle lama tidak terbawa. Firmware memigrasikan konfigurasi NVS lampu
pertama tanpa reset konfigurasi blower atau riwayat command; periksa jadwal hasil
migrasi setelah pembaruan. Detail ada pada README firmware.

## Pengujian

```powershell
npm test
npm run build
```

Suite v2 memuat 36 tes untuk domain, client API, proksi Node, dan React, termasuk
penolakan kontrak lama, payload campuran, kontrol lampu saat telemetry invalid,
perubahan mode, jadwal lintas tengah malam, dan konfirmasi command.
Pengujian Antares dan ESP32 nyata perlu dilakukan pada jaringan yang akan dipakai;
lihat [checklist verifikasi](../smart-home-sma/docs/verification.md).

## Jika telemetry mengalami timeout

Pesan timeout berarti proksi Node belum menerima respons HTTPS dari Antares; itu belum menunjukkan access key atau nama device salah. Periksa apakah `https://platform.antares.id:8443` dapat diakses dari komputer yang menjalankan Node. Dashboard akan mencoba membaca telemetry kembali secara otomatis.

## Batasan keamanan

Access key hanya berada dalam `.env` pada proses Node dan tidak dikirim ke browser. Dashboard belum memiliki login; bila server dibuka ke LAN, batasi akses ke jaringan tepercaya. Gunakan ini untuk prototipe pembelajaran, bukan instalasi produksi.
