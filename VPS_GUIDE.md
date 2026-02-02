# 🖥️ Panduan Deploy ke VPS

Panduan lengkap untuk menjalankan Discord Member Analytics di VPS (Ubuntu/Debian).

---

## 📋 Persyaratan

- VPS dengan OS Linux (Ubuntu 20.04+ / Debian 10+ recommended)
- Minimal RAM: 1GB
- Node.js 18+ 
- Akun Discord (gunakan akun tumbal!)

---

## 🚀 Step-by-Step Deployment

### Step 1: Dapatkan Token di PC Lokal (Windows)

Sebelum deploy ke VPS, dapatkan Discord token terlebih dahulu di PC lokal:

```bash
# Di PC Windows Anda
cd discord-server-scraper
npm install
npm run analyze
```

Login dengan akun tumbal, lalu setelah selesai:
- Buka file `discord_token.txt` 
- Copy isi token tersebut (simpan di notepad)

**⚠️ PENTING: Jaga kerahasiaan token ini!**

---

### Step 2: Siapkan VPS

SSH ke VPS Anda:
```bash
ssh user@ip-vps-anda
```

Install Node.js 20:
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 (menggunakan NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verifikasi instalasi
node --version  # Harus v20.x.x
npm --version
```

Install Git (jika belum):
```bash
sudo apt install -y git
```

---

### Step 3: Upload Project ke VPS

**Opsi A: Clone dari GitHub (Recommended)**
```bash
cd ~
git clone https://github.com/username/discord-server-scraper.git
cd discord-server-scraper
```

**Opsi B: Upload manual via SCP**
```bash
# Dari PC Windows (PowerShell), upload folder project:
scp -r "C:\Users\HP\codingan\discord-server-scraper" user@ip-vps:~/
```

---

### Step 4: Setup Environment

```bash
cd ~/discord-server-scraper

# Install dependencies
npm install

# Buat file .env
nano .env
```

Isi file `.env` dengan:
```env
# PENTING: Gunakan TOKEN langsung, bukan email/password!
USER_TOKEN=paste_token_dari_step_1_disini

# Server ID yang ingin di-analyze
SERVER_ID=1234567890123456789
```

Simpan file: `Ctrl+O`, Enter, `Ctrl+X`

---

### Step 5: Konfigurasi Channel

Edit file konfigurasi channel:
```bash
nano analyze-members.js
```

Pastikan channel ID sudah benar:
```javascript
const CHANNEL_CATEGORIES = {
  "tweet": [
    "1347351535071400047",
  ],
  "art": [
    "1349784473956257914",
  ],
};
```

Simpan: `Ctrl+O`, Enter, `Ctrl+X`

---

### Step 6: Jalankan Analytics

```bash
# Test run
npm run analyze
```

Output akan muncul di terminal dan hasil disimpan di folder `analytics/`.

---

### Step 7: Jalankan di Background (Optional)

Untuk menjalankan proses yang lama tanpa harus tetap terhubung SSH:

**Menggunakan screen:**
```bash
# Install screen
sudo apt install -y screen

# Buat session baru
screen -S discord-analytics

# Jalankan script
npm run analyze

# Detach dari session: Ctrl+A lalu D
# Untuk kembali ke session: screen -r discord-analytics
```

**Menggunakan nohup:**
```bash
nohup npm run analyze > output.log 2>&1 &

# Cek log:
tail -f output.log
```

---

### Step 8: Download Hasil ke PC

Dari PC Windows (PowerShell):
```bash
# Download folder analytics
scp -r user@ip-vps:~/discord-server-scraper/analytics ./hasil-analytics
```

Atau dari VPS, compress dulu:
```bash
cd ~/discord-server-scraper
zip -r analytics.zip analytics/
```

Lalu download file zip.

---

## 🔧 Troubleshooting

### Error: "No Discord token provided"
- Pastikan file `.env` sudah ada dan `USER_TOKEN` terisi

### Error: "Server ID not found"
- Pastikan akun tumbal sudah JOIN server target
- Cek `SERVER_ID` di `.env` sudah benar

### Error: "Cannot read messages"
- Akun tumbal mungkin tidak punya akses ke channel tersebut
- Pastikan channel ID benar

### Proses terlalu lama / hang
- Server dengan banyak member/pesan butuh waktu lama
- Coba kurangi `MESSAGE_LIMIT` di `analyze-members.js`

### Error: ECONNRESET / Network issues
- Rate limit dari Discord
- Tambah delay di kode atau tunggu beberapa menit

---

## 📁 Struktur Output

Setelah selesai, folder `analytics/` akan berisi:

```
analytics/
├── members.json           # Semua member + roles
├── member_activity.json   # Aktivitas per member
├── leaderboards.json      # Ranking per kategori
├── activity_data.csv      # Untuk Excel
└── activity_report.txt    # Laporan readable
```

---

## 🔄 Menjalankan Ulang / Update

Jika ingin menjalankan ulang untuk data terbaru:

```bash
cd ~/discord-server-scraper

# Hapus hasil lama (optional)
rm -rf analytics/

# Jalankan ulang
npm run analyze
```

---

## ⚠️ Catatan Keamanan

1. **Jangan share token** - Token seperti password, siapa yang punya bisa akses akun
2. **Gunakan akun tumbal** - Jangan pakai akun utama
3. **Protect file .env** - Jangan push ke GitHub public
4. **Token bisa expired** - Jika error auth, generate token baru

---

## 📞 Command Cheatsheet

```bash
# Jalankan analytics
npm run analyze

# Lihat daftar channel (untuk cari ID)
npm run channels

# Scrape semua data server
npm run start
```

---

Selamat menggunakan! 🎉
