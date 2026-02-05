-- Add x_username column to seismic_dc_user table
ALTER TABLE seismic_dc_user
ADD COLUMN IF NOT EXISTS x_username TEXT;

-- Create index for faster lookups on x_username
CREATE INDEX IF NOT EXISTS idx_seismic_dc_user_x_username ON seismic_dc_user(x_username);
