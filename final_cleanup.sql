-- ==========================================
-- FINAL CLEANUP SCRIPT
-- Membersihkan semua data NULL (Magnitude, Region, Promotion)
-- ==========================================

-- 1. FIX MAGNITUDE NULL (Role Kamis & Jumat)
-- Mencari role yang mengandung kata "agnitude" dan mengambil angkanya
WITH magnitude_fix AS (
  SELECT 
    id,
    (
      SELECT substring(elem from '([0-9]+\.?[0-9]*)')::numeric
      FROM unnest(roles) as elem
      WHERE elem ILIKE '%agnitude%' -- Case insensitive & flexible
      LIMIT 1
    ) as found_mag
  FROM seismic_dc_user
  WHERE role_kamis IS NULL OR role_jumat IS NULL
)
UPDATE seismic_dc_user
SET 
  role_kamis = COALESCE(role_kamis, m.found_mag),
  role_jumat = COALESCE(role_jumat, m.found_mag)
FROM magnitude_fix m
WHERE seismic_dc_user.id = m.id
AND m.found_mag IS NOT NULL;

-- 2. FIX REGION NULL
-- Mengisi kolom region berdasarkan daftar role negara
WITH region_fix AS (
  SELECT 
    id,
    (
      SELECT elem
      FROM unnest(roles) as elem
      WHERE elem IN (
          'Ukrainian', 'Indian', 'Turkish', 'Russian', 'Indonesian',
          'Nigerian', 'Vietnamese', 'Pakistan', 'Philippines', 'Chinese',
          'Korean', 'Japanese', 'Bangladeshi', 'Iranian', 'Italian',
          'Brazilian', 'French', 'Thai', 'Polish', 'Portugal',
          'Singapore/Malaysia', 'Moroccan', 'Arabic', 'Egyptian'
      )
      LIMIT 1
    ) as found_region
  FROM seismic_dc_user
  WHERE region IS NULL
)
UPDATE seismic_dc_user
SET region = r.found_region
FROM region_fix r
WHERE seismic_dc_user.id = r.id
AND r.found_region IS NOT NULL;

-- 3. FIX PROMOTION NULL
-- Set default FALSE jika status promosi masih kosong
UPDATE seismic_dc_user
SET is_promoted = FALSE
WHERE is_promoted IS NULL;
