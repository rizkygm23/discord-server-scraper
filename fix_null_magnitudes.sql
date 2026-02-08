WITH calculated_mag AS (
  SELECT 
    id,
    (
      -- Ambil angka terbesar dengan Regex yang Case-Insensitive
      SELECT MAX(
        NULLIF(
            REGEXP_REPLACE(LOWER(elem), '.*magnitude\s*([0-9]+\.?[0-9]*).*', '\1'), 
            LOWER(elem) 
        )::numeric
      )
      FROM unnest(roles) as elem
      WHERE elem ~* 'magnitude' 
    ) as max_mag
  FROM seismic_dc_user
  WHERE role_kamis IS NULL OR role_jumat IS NULL -- Target semua yg bolong 
)
UPDATE seismic_dc_user
SET 
  role_kamis = COALESCE(role_kamis, c.max_mag), 
  role_jumat = COALESCE(role_jumat, c.max_mag)  
FROM calculated_mag c
WHERE seismic_dc_user.id = c.id
AND c.max_mag IS NOT NULL;