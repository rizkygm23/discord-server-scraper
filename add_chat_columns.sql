-- Add chat count columns to seismic_dc_user table
ALTER TABLE seismic_dc_user
ADD COLUMN IF NOT EXISTS general_chat INTEGER DEFAULT 0;

ALTER TABLE seismic_dc_user
ADD COLUMN IF NOT EXISTS magnitude_chat INTEGER DEFAULT 0;

ALTER TABLE seismic_dc_user
ADD COLUMN IF NOT EXISTS devnet_chat INTEGER DEFAULT 0;

ALTER TABLE seismic_dc_user
ADD COLUMN IF NOT EXISTS report_chat INTEGER DEFAULT 0;
