# Dokumentasi Multi-Project Discord Scraper

Dokumen ini menjelaskan cara pakai scraper setelah update modular multi-server/multi-channel.

## Konsep Utama

Scraper sekarang memakai konsep **project**.

Satu project mewakili satu server Discord dan satu tabel database sendiri.

Contoh:

```txt
Project seismic      -> table seismic_dc_user
Project nama_project -> table nama_project_dc_user
```

Config semua project ada di:

```txt
projects.config.json
```

Output, checkpoint, dan cache tiap project dipisah supaya data antar server tidak bercampur.

## File Penting

```txt
projects.config.json       Config server/channel/table per project
auto-analyze.js            Entrypoint utama untuk run scraper
analytics.js               Logic Discord scraping, checkpoint, refetch cache
supabase.js                Logic database Supabase dinamis per table
project-config.js          Loader dan validator config project
data/<project>/output      Output hasil analytics
data/<project>/state       Checkpoint dan refetch cache project
```

## Environment

Pastikan `.env` berisi minimal:

```env
USER_TOKEN=discord_user_token
SERVER_ID=server_id_default_seismic

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Alternatif Discord login masih bisa memakai:

```env
DISCORD_EMAIL=email
DISCORD_PASSWORD=password
```

Tapi penggunaan `USER_TOKEN` lebih praktis untuk run otomatis.

## Melihat Project Yang Tersedia

```bash
node auto-analyze.js --list
```

Contoh output:

```txt
seismic: server=1343751435711414362, table=seismic_dc_user
```

## Struktur Config Project

Contoh project di `projects.config.json`:

```json
{
  "key": "seismic",
  "name": "Seismic",
  "serverId": "${SERVER_ID}",
  "tableName": "seismic_dc_user",
  "outputDir": "data/seismic/output",
  "stateDir": "data/seismic/state",
  "messageLimit": "Infinity",
  "channels": {
    "tweet": ["1347351535071400047"],
    "art": ["1349784473956257914"]
  },
  "features": {
    "magnitudePromotion": true,
    "regionRole": true,
    "sanitizePromotions": true
  },
  "schedule": {
    "timezone": "Asia/Jakarta",
    "defaultHour": 7,
    "fridayHour": 17
  }
}
```

Penjelasan field:

```txt
key                  ID project, huruf kecil/angka/underscore
name                 Nama tampilan project
serverId             Discord server ID, boleh literal atau ${ENV_NAME}
tableName            Nama table Supabase, format nama_project_dc_user
outputDir            Folder output analytics
stateDir             Folder checkpoint dan refetch cache
messageLimit         Jumlah pesan per channel, gunakan "Infinity" untuk semua
channels             Kategori channel yang akan discrape
features             Fitur tambahan per project
schedule.defaultHour Jam run harian WIB
schedule.fridayHour  Jam run hari Jumat WIB
```

## Menambahkan Server/Project Baru

Tambahkan object baru ke array `projects` di `projects.config.json`.

Contoh:

```json
{
  "key": "komunitas_baru",
  "name": "Komunitas Baru",
  "serverId": "123456789012345678",
  "tableName": "komunitas_baru_dc_user",
  "outputDir": "data/komunitas_baru/output",
  "stateDir": "data/komunitas_baru/state",
  "messageLimit": "Infinity",
  "channels": {
    "general": ["111111111111111111"],
    "art": ["222222222222222222"],
    "event": ["333333333333333333"]
  },
  "features": {
    "magnitudePromotion": false,
    "regionRole": false,
    "sanitizePromotions": false
  },
  "schedule": {
    "timezone": "Asia/Jakarta",
    "defaultHour": 7,
    "fridayHour": 17
  }
}
```

Kalau `tableName` tidak diisi, script akan memakai:

```txt
<key>_dc_user
```

Contoh:

```txt
komunitas_baru -> komunitas_baru_dc_user
```

Nama kategori channel akan menjadi kolom database.

Contoh:

```json
"channels": {
  "general": ["..."],
  "art-room": ["..."]
}
```

Akan menjadi kolom:

```txt
general
art_room
```

## Generate / Init Database

Untuk project tertentu:

```bash
node auto-analyze.js --project komunitas_baru --init-db
```

Untuk semua project:

```bash
node auto-analyze.js --all --init-db
```

Script akan membuat file SQL otomatis di:

```txt
data/<project>/output/database/<table_name>.sql
```

Jika Supabase kamu punya RPC SQL executor, script akan coba apply otomatis. RPC yang dicoba:

```txt
SUPABASE_SQL_RPC dari .env
exec_sql
execute_sql
```

Kalau tidak ada RPC executor, jalankan isi file SQL tersebut manual di Supabase SQL Editor.

## Run Scraper Sekali

Run default project:

```bash
node auto-analyze.js --once
```

Run project tertentu:

```bash
node auto-analyze.js --project seismic --once
```

Run semua project sekali:

```bash
node auto-analyze.js --all --once
```

## Run Scheduled Loop

Default project:

```bash
node auto-analyze.js
```

Project tertentu:

```bash
node auto-analyze.js --project seismic
```

Semua project:

```bash
node auto-analyze.js --all
```

Mode scheduled loop akan run sekali saat start, lalu tidur sampai jadwal berikutnya.

## Manual Mode Kamis / Jumat / Biasa

Untuk force snapshot Kamis:

```bash
node auto-analyze.js --project seismic --kamis
```

Untuk force snapshot Jumat:

```bash
node auto-analyze.js --project seismic --jumat
```

Untuk run normal tanpa snapshot:

```bash
node auto-analyze.js --project seismic --biasa
```

Flag `--kamis`, `--jumat`, dan `--biasa` otomatis membuat script run sekali lalu exit.

## Fitur Per Project

```json
"features": {
  "magnitudePromotion": true,
  "regionRole": true,
  "sanitizePromotions": true
}
```

Penjelasan:

```txt
magnitudePromotion   Aktifkan snapshot role_kamis/role_jumat dan promosi
regionRole           Ambil region dari role Discord
sanitizePromotions   Bersihkan false promotion setelah save
```

Untuk server biasa yang tidak punya role Magnitude, pakai:

```json
"features": {
  "magnitudePromotion": false,
  "regionRole": false,
  "sanitizePromotions": false
}
```

## Checkpoint Dan Cache

Setiap project punya folder state sendiri:

```txt
data/<project>/state/channel_checkpoints.json
data/<project>/state/member_refetch_cache.json
data/<project>/state/<channel_id>_checkpoint.json
```

Fungsinya:

```txt
channel_checkpoints.json        Menyimpan message ID terbaru per channel
member_refetch_cache.json       Cache hasil refetch member
<channel_id>_checkpoint.json    Data pesan historis per channel
```

Pada run pertama setelah update modular, script akan mencoba migrasi checkpoint lama dari root project ke folder state project jika file state belum ada.

## Output Analytics

Output disimpan ke:

```txt
data/<project>/output/analytics/
```

File yang dibuat:

```txt
members.json
member_activity.json
leaderboards.json
activity_report.txt
activity_data.csv
```

## Workflow Tambah Project Baru

1. Tambah config project baru di `projects.config.json`.
2. Jalankan:

```bash
node auto-analyze.js --project nama_project --init-db
```

3. Kalau table belum bisa dibuat otomatis, buka file SQL di:

```txt
data/nama_project/output/database/nama_project_dc_user.sql
```

Lalu jalankan manual di Supabase SQL Editor.

4. Test run sekali:

```bash
node auto-analyze.js --project nama_project --once
```

5. Kalau sudah aman, jalankan scheduled:

```bash
node auto-analyze.js --project nama_project
```

Atau semua project:

```bash
node auto-analyze.js --all
```

## Catatan Penting

- Pastikan akun Discord/token punya akses ke server dan channel yang discrape.
- Nama project harus lowercase dan memakai underscore, contoh `komunitas_baru`.
- Nama table harus format `nama_project_dc_user`.
- Jangan hapus folder `state` kecuali mau scan ulang dari awal.
- Kalau user yang sebelumnya cached `[Left Server]` join lagi, hapus entry di `member_refetch_cache.json` atau hapus file cache supaya dicek ulang.
