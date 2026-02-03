-- =============================================
-- Supabase Table: seismic_dc_user
-- Discord Member Activity Tracking
-- Full Schema with Extended User Data
-- =============================================

-- Create the table (for new installation)
CREATE TABLE IF NOT EXISTS seismic_dc_user (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,              -- Discord User ID
    username TEXT NOT NULL,                     -- Discord Username
    display_name TEXT,                          -- Discord Display Name / Nickname
    discriminator TEXT DEFAULT '0',             -- Discord Discriminator (#0000)
    avatar_url TEXT,                            -- Profile picture URL
    banner_url TEXT,                            -- Profile banner URL
    accent_color INTEGER,                       -- Profile accent color
    roles TEXT[],                               -- Array of role names
    is_bot BOOLEAN DEFAULT FALSE,               -- Is this a bot account
    joined_at TIMESTAMP,                        -- When joined the server
    account_created TIMESTAMP,                  -- When Discord account was created
    custom_status TEXT,                         -- Custom status text
    connected_accounts TEXT[],                  -- Connected accounts (Twitter, GitHub, etc)
    tweet INTEGER DEFAULT 0,                    -- Tweet posts count
    art INTEGER DEFAULT 0,                      -- Art submissions count
    other INTEGER DEFAULT 0,                    -- Other channel messages
    total_messages INTEGER DEFAULT 0,           -- Total messages across all channels
    first_message_date TIMESTAMP,               -- First message date
    last_message_date TIMESTAMP,                -- Last message date
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_seismic_dc_user_username ON seismic_dc_user(username);
CREATE INDEX IF NOT EXISTS idx_seismic_dc_user_total_messages ON seismic_dc_user(total_messages DESC);
CREATE INDEX IF NOT EXISTS idx_seismic_dc_user_tweet ON seismic_dc_user(tweet DESC);
CREATE INDEX IF NOT EXISTS idx_seismic_dc_user_art ON seismic_dc_user(art DESC);
CREATE INDEX IF NOT EXISTS idx_seismic_dc_user_joined_at ON seismic_dc_user(joined_at);
CREATE INDEX IF NOT EXISTS idx_seismic_dc_user_account_created ON seismic_dc_user(account_created);

-- Create or replace function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_seismic_dc_user_updated_at ON seismic_dc_user;
CREATE TRIGGER update_seismic_dc_user_updated_at
    BEFORE UPDATE ON seismic_dc_user
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
