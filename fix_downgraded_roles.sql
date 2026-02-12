-- ==========================================
-- FIX DOWNGRADED ROLES (REVISI LOGIC)
-- Memperbaiki user yang role_jumat-nya tiba-tiba turun jadi 1.0
-- karena kesalahan script cleanup sebelumnya.
-- ==========================================

WITH magnitude_fix AS (
  SELECT 
    id,
    (
      -- LOGIC BARU: Ambil MAX (Tertinggi), bukan sembarang LIMIT 1
      SELECT MAX(substring(elem from '([0-9]+\.?[0-9]*)')::numeric)
      FROM unnest(roles) as elem
      WHERE elem ILIKE '%agnitude%'
    ) as real_highest_mag
  FROM seismic_dc_user
  -- Target: Yang role_jumat-nya TIDAK SAMA dengan role_kamis
  -- Atau yang role_jumat-nya terlalu kecil (misal 1.0 padahal punya role lebih tinggi)
  WHERE role_jumat IS NOT NULL
)
UPDATE seismic_dc_user
SET 
  -- Update Role Jumat ke nilai tertinggi yang sah
  role_jumat = m.real_highest_mag
FROM magnitude_fix m
WHERE seismic_dc_user.id = m.id
AND m.real_highest_mag IS NOT NULL
AND seismic_dc_user.role_jumat < m.real_highest_mag; -- Hanya update jika nilai sekarang LEBIH KECIL dari aslinya

-- Reset status promosi yang salah akibat downgrade tadi
UPDATE seismic_dc_user
SET is_promoted = FALSE
WHERE role_kamis >= role_jumat;
