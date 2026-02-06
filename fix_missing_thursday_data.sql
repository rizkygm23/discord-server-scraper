-- Karena data baru direset di hari Jumat, tidak ada data hari Kamis (role_kamis) untuk dibandingkan.
-- Script ini akan "mengisi paksa" role_kamis agar fitur promosi bisa dites.

-- 1. Isi role_kamis dengan nilai yang sama dengan role_jumat (sebagai baseline/awal)
-- Ini membuat sistem menganggap "tidak ada perubahan" (stabil).
UPDATE seismic_dc_user
SET role_kamis = role_jumat
WHERE role_kamis IS NULL AND role_jumat IS NOT NULL;

-- 2. (OPSIONAL) Simulasi Promosi
-- Jalankan query di bawah ini jika ingin mengetes user tertentu NAIK PANGKAT.
-- Ganti 'username_target' dengan username asli.
-- Kita set role_kamis lebih KECIL dari role_jumat (misal: jumat 2.0, kita set kamis 1.0)

/*
UPDATE seismic_dc_user
SET role_kamis = 1.0
WHERE username = 'username_target';
*/
