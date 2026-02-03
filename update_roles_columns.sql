-- Add columns for role snapshot and promotion tracking
ALTER TABLE seismic_dc_user 
ADD COLUMN IF NOT EXISTS role_kamis DECIMAL(3,1),
ADD COLUMN IF NOT EXISTS role_sabtu DECIMAL(3,1),
ADD COLUMN IF NOT EXISTS is_promoted BOOLEAN DEFAULT FALSE;
