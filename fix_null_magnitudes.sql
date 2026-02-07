-- SQL Script untuk memperbaiki 5444 user yang datanya NULL
-- Query ini mengekstrak nilai Magnitude langsung dari kolom 'roles' yang sudah tersimpan

WITH calculated_mag AS (
  SELECT 
    id,
    (
      -- Ekstrak angka dari teks "Magnitude X.X" dalam array roles
      -- Menggunakan unnest untuk memecah array, dan substring regex untuk ambil angka
      SELECT MAX(NULLIF(substring(elem from 'Magnitude ([0-9]+\.?[0-9]*)'), '')::numeric)
      FROM unnest(roles) as elem
      WHERE elem ~* 'magnitude'
    ) as max_mag
  FROM seismic_dc_user
  WHERE role_jumat IS NULL -- Target hanya yang datanya masih kosong
)
UPDATE seismic_dc_user
SET 
    role_jumat = c.max_mag,
    -- Kita isi role_kamis juga sebagai baseline (titik awal)
    -- Supaya tidak terdeteksi sebagai "Promosi" palsu karena perbandingan NULL vs Angka
    role_kamis = c.max_mag 
FROM calculated_mag c
WHERE seismic_dc_user.id = c.id
AND c.max_mag IS NOT NULL;
