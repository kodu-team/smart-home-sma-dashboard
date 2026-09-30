# Smart Home SMA — Dashboard

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
- Status lampu, blower, dan kunci selalu mengikuti `actuator` pada telemetry. Tombol **Matikan Sekarang** Lampu 1 tersedia pada mode jadwal.

## Pengujian

```powershell
npm test
npm run build
```

Pengujian Antares dan ESP32 nyata perlu dilakukan pada jaringan yang akan dipakai. Verifikasi khususnya pembacaan telemetry, konfirmasi command, perubahan mode, serta perilaku perangkat ketika offline.

## Jika telemetry mengalami timeout

Pesan timeout berarti proksi Node belum menerima respons HTTPS dari Antares; itu belum menunjukkan access key atau nama device salah. Periksa apakah `https://platform.antares.id:8443` dapat diakses dari komputer yang menjalankan Node. Dashboard akan mencoba membaca telemetry kembali secara otomatis.

## Batasan keamanan

Access key hanya berada dalam `.env` pada proses Node dan tidak dikirim ke browser. Dashboard belum memiliki login; bila server dibuka ke LAN, batasi akses ke jaringan tepercaya. Gunakan ini untuk prototipe pembelajaran, bukan instalasi produksi.
