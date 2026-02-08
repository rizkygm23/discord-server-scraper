-- Add region column to store user's regional/nationality role
ALTER TABLE seismic_dc_user 
ADD COLUMN IF NOT EXISTS region VARCHAR(100);

-- Optional: Backfill existing data with region from roles array
-- This uses the same list as the JavaScript code
WITH region_extract AS (
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
FROM region_extract r
WHERE seismic_dc_user.id = r.id
AND r.found_region IS NOT NULL;
