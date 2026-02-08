# 📊 Database Documentation

## Overview

Database untuk menyimpan data member Discord beserta aktivitas mereka di server.

**Database**: Supabase (PostgreSQL)  
**Table**: `seismic_dc_user`

---

## 🗄️ Table Schema

### `seismic_dc_user`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | BIGSERIAL | NO | auto | Primary key |
| `user_id` | TEXT | NO | - | Discord User ID (unique) |
| `username` | TEXT | NO | - | Discord username (e.g. `cryptowhale`) |
| `display_name` | TEXT | YES | NULL | Server nickname / display name |
| `discriminator` | TEXT | YES | '0' | Discord discriminator (#0000) - **Usually empty for new usernames** |
| `avatar_url` | TEXT | YES | NULL | Profile picture URL |
| `banner_url` | TEXT | YES | NULL | Profile banner URL - **Currently not fetched** |
| `accent_color` | INTEGER | YES | NULL | Profile accent color - **Usually empty** |
| `roles` | TEXT[] | YES | [] | Array of role names |
| `is_bot` | BOOLEAN | NO | FALSE | Is this a bot account |
| `joined_at` | TIMESTAMP | YES | NULL | When user joined the server |
| `account_created` | TIMESTAMP | YES | NULL | When Discord account was created |
| `custom_status` | TEXT | YES | NULL | Custom status text - **Usually empty** |
| `connected_accounts` | TEXT[] | YES | [] | Connected accounts - **Currently not fetched** |
| `tweet` | INTEGER | NO | 0 | Tweet channel message count |
| `art` | INTEGER | NO | 0 | Art channel message count |
| `total_messages` | INTEGER | NO | 0 | Total contributions (tweet + art) |
| `first_message_date` | TIMESTAMP | YES | NULL | First message timestamp |
| `last_message_date` | TIMESTAMP | YES | NULL | Date of the latest message sent |
| `role_kamis` | DECIMAL(3,1) | YES | NULL | **Snapshot**: Highest "Magnitude" role value captured on Thursday |
| `role_jumat` | DECIMAL(3,1) | YES | NULL | **Snapshot**: Highest "Magnitude" role value captured on Friday |
| `is_promoted` | BOOLEAN | YES | FALSE | **Analysis**: TRUE if `role_jumat` > `role_kamis` (Promoted this week) |
| `x_username` | TEXT | YES | NULL | Twitter/X username extracted from tweet links |
| `region` | VARCHAR(100) | YES | NULL | User's regional/nationality role (e.g. Indonesian, Nigerian) |
| `created_at` | TIMESTAMPTZ | NO | NOW() | Record creation time |
| `updated_at` | TIMESTAMPTZ | NO | NOW() | Record last update time |

---

## ⚠️ Column Notes

### Columns That May Be Empty/Null

| Column | Reason |
|--------|--------|
| `discriminator` | New Discord usernames don't have discriminators |
| `banner_url` | Requires additional API call per user (not implemented) |
| `accent_color` | Only available if user has set it |
| `custom_status` | Only available if user is online at fetch time |
| `connected_accounts` | Requires fetching user profile (not implemented) |
| `joined_at` | May be null for users who left and rejoined |
| `account_created` | May be null for users fetched on-demand |

### Special Role Values

| Value | Meaning |
|-------|---------|
| `[Left Server]` | User has left the server |
| `[Not Fetched]` | User data couldn't be fetched |
| `[Bot]` | Bot account |
| `No Roles` | User has no roles assigned |

---

## 📐 Indexes

```sql
CREATE INDEX idx_seismic_dc_user_username ON seismic_dc_user(username);
CREATE INDEX idx_seismic_dc_user_total_messages ON seismic_dc_user(total_messages DESC);
CREATE INDEX idx_seismic_dc_user_tweet ON seismic_dc_user(tweet DESC);
CREATE INDEX idx_seismic_dc_user_art ON seismic_dc_user(art DESC);
CREATE INDEX idx_seismic_dc_user_joined_at ON seismic_dc_user(joined_at);
CREATE INDEX idx_seismic_dc_user_account_created ON seismic_dc_user(account_created);
```

---

## 🔧 SQL Setup

### Create Table (New Installation)

```sql
CREATE TABLE IF NOT EXISTS seismic_dc_user (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    display_name TEXT,
    discriminator TEXT DEFAULT '0',
    avatar_url TEXT,
    banner_url TEXT,
    accent_color INTEGER,
    roles TEXT[],
    is_bot BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMP,
    account_created TIMESTAMP,
    custom_status TEXT,
    connected_accounts TEXT[],
    tweet INTEGER DEFAULT 0,
    art INTEGER DEFAULT 0,
    total_messages INTEGER DEFAULT 0,
    first_message_date TIMESTAMP,
    last_message_date TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Add Columns (Existing Table)

```sql
ALTER TABLE seismic_dc_user ADD COLUMN IF NOT EXISTS discriminator TEXT DEFAULT '0';
ALTER TABLE seismic_dc_user ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE seismic_dc_user ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE seismic_dc_user ADD COLUMN IF NOT EXISTS accent_color INTEGER;
ALTER TABLE seismic_dc_user ADD COLUMN IF NOT EXISTS joined_at TIMESTAMP;
ALTER TABLE seismic_dc_user ADD COLUMN IF NOT EXISTS account_created TIMESTAMP;
ALTER TABLE seismic_dc_user ADD COLUMN IF NOT EXISTS custom_status TEXT;
ALTER TABLE seismic_dc_user ADD COLUMN IF NOT EXISTS connected_accounts TEXT[];
ALTER TABLE seismic_dc_user ADD COLUMN IF NOT EXISTS x_username TEXT;
ALTER TABLE seismic_dc_user ADD COLUMN IF NOT EXISTS region VARCHAR(100);
ALTER TABLE seismic_dc_user ADD COLUMN IF NOT EXISTS role_kamis DECIMAL(3,1);
ALTER TABLE seismic_dc_user ADD COLUMN IF NOT EXISTS role_jumat DECIMAL(3,1);
ALTER TABLE seismic_dc_user ADD COLUMN IF NOT EXISTS is_promoted BOOLEAN DEFAULT FALSE;
```

### Auto-Update Trigger

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_seismic_dc_user_updated_at ON seismic_dc_user;
CREATE TRIGGER update_seismic_dc_user_updated_at
    BEFORE UPDATE ON seismic_dc_user
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

---

## 📝 Example Data

```json
{
  "id": 1,
  "user_id": "414717779912949760",
  "username": "cryptowhale",
  "display_name": "🐋 Whale",
  "discriminator": "0",
  "avatar_url": "https://cdn.discordapp.com/avatars/414717779912949760/abc123.png",
  "banner_url": null,
  "accent_color": null,
  "roles": ["OG", "Whale", "Magnitude 3.0", "Verified", "Indonesian"],
  "is_bot": false,
  "joined_at": "2024-01-15T10:00:00.000Z",
  "account_created": "2018-05-20T08:30:00.000Z",
  "custom_status": null,
  "connected_accounts": [],
  "tweet": 156,
  "art": 45,
  "total_messages": 201,
  "first_message_date": "2024-01-16T12:30:00.000Z",
  "last_message_date": "2024-02-03T09:15:00.000Z",
  "x_username": "cryptowhale",
  "region": "Indonesian",
  "role_kamis": 3.0,
  "role_jumat": 3.0,
  "is_promoted": false,
  "created_at": "2024-02-01T00:00:00.000Z",
  "updated_at": "2024-02-03T10:00:00.000Z"
}
```

---

## 🔍 Common Queries

### Get Leaderboard (Top 100 by Total Messages)

```sql
SELECT 
    user_id,
    username,
    display_name,
    roles,
    tweet,
    art,
    total_messages
FROM seismic_dc_user
WHERE is_bot = FALSE
ORDER BY total_messages DESC
LIMIT 100;
```

### Get Leaderboard by Tweet Count

```sql
SELECT 
    user_id,
    username,
    display_name,
    tweet,
    total_messages
FROM seismic_dc_user
WHERE is_bot = FALSE AND tweet > 0
ORDER BY tweet DESC
LIMIT 100;
```

### Get User by Discord ID

```sql
SELECT * FROM seismic_dc_user
WHERE user_id = '414717779912949760';
```

### Get Users by Role

```sql
SELECT * FROM seismic_dc_user
WHERE 'Magnitude 3.0' = ANY(roles)
ORDER BY total_messages DESC;
```

### Get Active Users (Last 7 Days)

```sql
SELECT * FROM seismic_dc_user
WHERE last_message_date > NOW() - INTERVAL '7 days'
ORDER BY last_message_date DESC;
```

### Get Users Who Left Server

```sql
SELECT * FROM seismic_dc_user
WHERE '[Left Server]' = ANY(roles);
```

### Count Users by Role

```sql
SELECT 
    unnest(roles) as role_name,
    COUNT(*) as user_count
FROM seismic_dc_user
WHERE is_bot = FALSE
GROUP BY role_name
ORDER BY user_count DESC;
```

### Get Statistics Summary

```sql
SELECT 
    COUNT(*) as total_users,
    COUNT(*) FILTER (WHERE is_bot = FALSE) as human_users,
    COUNT(*) FILTER (WHERE is_bot = TRUE) as bot_users,
    SUM(total_messages) as total_messages,
    SUM(tweet) as tweet_messages,
    SUM(art) as art_messages,
    AVG(total_messages) FILTER (WHERE total_messages > 0) as avg_messages_per_active_user
FROM seismic_dc_user;
```

### Get Users by Region

```sql
SELECT * FROM seismic_dc_user
WHERE region = 'Indonesian'
ORDER BY total_messages DESC;
```

### Count Users by Region

```sql
SELECT 
    region,
    COUNT(*) as user_count,
    SUM(total_messages) as total_contributions
FROM seismic_dc_user
WHERE region IS NOT NULL
GROUP BY region
ORDER BY user_count DESC;
```

### Get Promoted Users This Week

```sql
SELECT 
    username,
    display_name,
    role_kamis,
    role_jumat,
    region
FROM seismic_dc_user
WHERE is_promoted = TRUE
ORDER BY role_jumat DESC;
```

---

## 🔗 API Endpoints (Suggested)

### REST API Structure

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | Get paginated user list |
| GET | `/api/users/:user_id` | Get user by Discord ID |
| GET | `/api/leaderboard` | Get top users by activity |
| GET | `/api/leaderboard/tweet` | Get top users by tweet count |
| GET | `/api/leaderboard/art` | Get top users by art count |
| GET | `/api/stats` | Get server statistics |
| GET | `/api/roles` | Get role distribution |

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20, max: 100) |
| `sort` | string | Sort field (total_messages, tweet, art, joined_at) |
| `order` | string | Sort order (asc, desc) |
| `role` | string | Filter by role name |
| `search` | string | Search by username |

---

## 🔐 Supabase RLS (Row Level Security)

### Enable RLS

```sql
ALTER TABLE seismic_dc_user ENABLE ROW LEVEL SECURITY;
```

### Public Read Access

```sql
CREATE POLICY "Allow public read access" 
ON seismic_dc_user 
FOR SELECT 
USING (true);
```

### Service Role Only Write

```sql
CREATE POLICY "Service role write access" 
ON seismic_dc_user 
FOR ALL 
USING (auth.role() = 'service_role');
```

---

## 📦 Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # For backend only
```

---

## 📋 Data Update Schedule

The scraper should be run periodically to update activity data:

| Frequency | Use Case |
|-----------|----------|
| Every 6 hours | Active communities |
| Daily | Standard updates |
| Weekly | Low-priority archival |

**Note**: Each run performs an `upsert` operation - existing records are updated, new users are inserted.
