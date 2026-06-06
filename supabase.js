const fs = require('fs-extra');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const DEFAULT_TABLE = 'seismic_dc_user';
const IDENTIFIER_REGEX = /^[a-z][a-z0-9_]*$/;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase credentials not configured. Data will not be saved to database.');
}

const supabase = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

function normalizeIdentifier(value, fallback = 'column') {
    const normalized = String(value || fallback)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_');

    if (!normalized) return fallback;
    if (/^[0-9]/.test(normalized)) return `c_${normalized}`;
    return normalized;
}

function assertIdentifier(identifier, type = 'identifier') {
    if (!IDENTIFIER_REGEX.test(identifier)) {
        throw new Error(`Invalid ${type}: "${identifier}". Use lowercase letters, numbers, and underscores, starting with a letter.`);
    }
    return identifier;
}

function getTableName(options = {}) {
    return assertIdentifier(options.tableName || DEFAULT_TABLE, 'table name');
}

function getCategoryColumnMap(categories = [], activityData = []) {
    const categoryNames = new Set(categories || []);

    for (const member of activityData || []) {
        Object.keys(member.activity || {}).forEach(category => categoryNames.add(category));
    }

    const usedColumns = new Set();
    const map = {};

    for (const category of categoryNames) {
        let column = normalizeIdentifier(category, 'activity');
        let candidate = column;
        let suffix = 2;

        while (usedColumns.has(candidate)) {
            candidate = `${column}_${suffix}`;
            suffix++;
        }

        usedColumns.add(candidate);
        map[category] = assertIdentifier(candidate, 'category column');
    }

    return map;
}

function mapActivityRecords(activityData, categoryColumnMap) {
    return activityData.map(member => {
        const record = {
            user_id: member.userId,
            username: member.username,
            display_name: member.displayName,
            discriminator: member.discriminator || '0',
            avatar_url: member.avatar || null,
            accent_color: member.accentColor || null,
            roles: member.roles || [],
            is_bot: member.isBot || false,
            joined_at: member.joinedAt || null,
            account_created: member.createdAt || null,
            custom_status: member.customStatus || null,
            connected_accounts: member.connectedAccounts || [],
            total_messages: member.totalMessages || 0,
            first_message_date: member.firstMessageDate || null,
            last_message_date: member.lastMessageDate || null,
            x_username: member.xUsername || null
        };

        for (const [category, column] of Object.entries(categoryColumnMap)) {
            record[column] = member.activity?.[category] || 0;
        }

        if (member.roleKamis !== undefined && member.roleKamis !== null) {
            record.role_kamis = member.roleKamis;
        }
        if (member.roleJumat !== undefined && member.roleJumat !== null) {
            record.role_jumat = member.roleJumat;
        }
        if (member.isPromoted !== undefined && member.isPromoted !== null) {
            record.is_promoted = member.isPromoted;
        }
        if (member.region) {
            record.region = member.region;
        }

        return record;
    });
}

function buildProjectTableSql(tableName, categoryColumnMap = {}) {
    assertIdentifier(tableName, 'table name');
    const categoryColumns = Object.values(categoryColumnMap);
    categoryColumns.forEach(column => assertIdentifier(column, 'category column'));

    const categoryCreateColumns = categoryColumns
        .map(column => `    ${column} INTEGER DEFAULT 0,`)
        .join('\n');

    const categoryAlterColumns = categoryColumns
        .map(column => `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${column} INTEGER DEFAULT 0;`)
        .join('\n');

    const categoryIndexes = categoryColumns
        .map(column => `CREATE INDEX IF NOT EXISTS idx_${tableName}_${column} ON ${tableName}(${column} DESC);`)
        .join('\n');

    return `-- Auto-generated schema for ${tableName}
-- Generated at ${new Date().toISOString()}

CREATE TABLE IF NOT EXISTS ${tableName} (
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
${categoryCreateColumns ? `${categoryCreateColumns}\n` : ''}    total_messages INTEGER DEFAULT 0,
    x_username TEXT,
    first_message_date TIMESTAMP,
    last_message_date TIMESTAMP,
    role_kamis DECIMAL(3,1),
    role_jumat DECIMAL(3,1),
    is_promoted BOOLEAN DEFAULT FALSE,
    region VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS discriminator TEXT DEFAULT '0';
ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS accent_color INTEGER;
ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS roles TEXT[];
ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT FALSE;
ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS joined_at TIMESTAMP;
ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS account_created TIMESTAMP;
ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS custom_status TEXT;
ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS connected_accounts TEXT[];
${categoryAlterColumns ? `${categoryAlterColumns}\n` : ''}ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS total_messages INTEGER DEFAULT 0;
ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS x_username TEXT;
ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS first_message_date TIMESTAMP;
ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS last_message_date TIMESTAMP;
ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS role_kamis DECIMAL(3,1);
ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS role_jumat DECIMAL(3,1);
ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS is_promoted BOOLEAN DEFAULT FALSE;
ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS region VARCHAR(100);
ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_${tableName}_username ON ${tableName}(username);
CREATE INDEX IF NOT EXISTS idx_${tableName}_total_messages ON ${tableName}(total_messages DESC);
CREATE INDEX IF NOT EXISTS idx_${tableName}_joined_at ON ${tableName}(joined_at);
CREATE INDEX IF NOT EXISTS idx_${tableName}_account_created ON ${tableName}(account_created);
${categoryIndexes ? `${categoryIndexes}\n` : ''}CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_${tableName}_updated_at ON ${tableName};
CREATE TRIGGER update_${tableName}_updated_at
    BEFORE UPDATE ON ${tableName}
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
`;
}

async function writeProjectSchemaSql(sql, options = {}) {
    const outputDir = options.outputDir || '.';
    const schemaDir = path.join(outputDir, 'database');
    await fs.ensureDir(schemaDir);

    const filePath = path.join(schemaDir, `${getTableName(options)}.sql`);
    await fs.writeFile(filePath, sql, 'utf8');
    return filePath;
}

async function tableExists(tableName) {
    if (!supabase) return false;

    const { error } = await supabase
        .from(tableName)
        .select('id', { head: true, count: 'exact' })
        .limit(1);

    return !error;
}

async function tryExecuteSql(sql) {
    if (!supabase) {
        return { success: false, error: 'Supabase client is not initialized.' };
    }

    const rpcNames = [
        process.env.SUPABASE_SQL_RPC,
        'exec_sql',
        'execute_sql'
    ].filter(Boolean);

    const tried = new Set();
    for (const rpcName of rpcNames) {
        if (tried.has(rpcName)) continue;
        tried.add(rpcName);

        for (const params of [{ sql }, { query: sql }]) {
            try {
                const { error } = await supabase.rpc(rpcName, params);
                if (!error) {
                    return { success: true, rpcName };
                }
            } catch (err) {
                // Try the next known RPC shape.
            }
        }
    }

    return {
        success: false,
        error: 'No SQL executor RPC is available. Generated SQL must be run manually or via a configured RPC.'
    };
}

async function ensureProjectTable(options = {}) {
    const tableName = getTableName(options);
    const categoryColumnMap = getCategoryColumnMap(options.categories || [], options.activityData || []);
    const sql = buildProjectTableSql(tableName, categoryColumnMap);
    const schemaPath = await writeProjectSchemaSql(sql, { ...options, tableName });

    if (!supabase) {
        return {
            success: false,
            skipped: true,
            schemaPath,
            error: 'Supabase client is not initialized.'
        };
    }

    const exists = await tableExists(tableName);
    if (exists && !options.forceSchemaSync) {
        return { success: true, exists: true, schemaPath, tableName };
    }

    const execResult = await tryExecuteSql(sql);
    if (execResult.success) {
        return {
            success: true,
            exists: true,
            createdOrSynced: true,
            rpcName: execResult.rpcName,
            schemaPath,
            tableName
        };
    }

    return {
        success: exists,
        exists,
        schemaPath,
        tableName,
        error: execResult.error
    };
}

async function saveToSupabase(activityData, options = {}) {
    if (!supabase) {
        console.log('Supabase not configured, skipping database save.');
        return { success: 0, errors: 0, skipped: true };
    }

    const tableName = getTableName(options);
    const categoryColumnMap = getCategoryColumnMap(options.categories || [], activityData);
    const records = mapActivityRecords(activityData, categoryColumnMap);

    console.log(`\nSaving ${activityData.length} members to Supabase table "${tableName}"...`);

    let successCount = 0;
    let errorCount = 0;
    const batchSize = options.batchSize || 100;

    for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);

        try {
            const { error } = await supabase
                .from(tableName)
                .upsert(batch, {
                    onConflict: 'user_id',
                    ignoreDuplicates: false
                });

            if (error) {
                console.error(`  Batch ${Math.floor(i / batchSize) + 1} error:`, error.message);
                errorCount += batch.length;
            } else {
                successCount += batch.length;
                console.log(`  Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(records.length / batchSize)} saved (${batch.length} records)`);
            }
        } catch (err) {
            console.error(`  Batch ${Math.floor(i / batchSize) + 1} exception:`, err.message);
            errorCount += batch.length;
        }
    }

    console.log(`\nSupabase save complete: ${successCount} success, ${errorCount} errors`);
    return { success: successCount, errors: errorCount, skipped: false };
}

async function getMembersFromSupabase(options = {}) {
    if (!supabase) {
        return [];
    }

    const tableName = getTableName(options);
    const pageSize = options.pageSize || 1000;
    let allMembers = [];
    let from = 0;
    let more = true;

    console.log(`Fetching existing members from Supabase table "${tableName}"...`);

    while (more) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .order('total_messages', { ascending: false })
            .order('user_id', { ascending: true })
            .range(from, to);

        if (error) {
            console.error(`Error fetching members (range ${from}-${to}):`, error.message);
            break;
        }

        if (data && data.length > 0) {
            allMembers = allMembers.concat(data);
            from += pageSize;
            more = data.length === pageSize;
            process.stdout.write(`\r   Fetched ${allMembers.length} records...`);
        } else {
            more = false;
        }
    }

    console.log(`\nTotal members fetched: ${allMembers.length}`);
    return allMembers;
}

async function getLeaderboard(category = 'total_messages', limit = 50, options = {}) {
    if (!supabase) {
        return [];
    }

    const tableName = getTableName(options);
    const column = category === 'total_messages'
        ? 'total_messages'
        : normalizeIdentifier(category, 'activity');

    const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .order(column, { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching leaderboard:', error.message);
        return [];
    }

    return data;
}

async function testConnection(options = {}) {
    if (!supabase) {
        console.error('Supabase client is not initialized (missing URL or KEY).');
        return false;
    }

    const tableName = getTableName(options);

    try {
        console.log(`Testing connection to Supabase table "${tableName}"...`);
        const { error, count } = await supabase
            .from(tableName)
            .select('id', { count: 'exact', head: true });

        if (error) {
            console.error('Supabase connection/table check failed:', error.message);
            return false;
        }

        console.log(`Connection successful. Found ${count} records in "${tableName}".`);
        return true;
    } catch (err) {
        console.error('Unexpected error during Supabase connection test:', err);
        return false;
    }
}

async function checkMissingSnapshots(options = {}) {
    if (!supabase) return 0;

    const tableName = getTableName(options);
    const { data, error } = await supabase
        .from(tableName)
        .select('username, roles, role_kamis, role_jumat')
        .is('role_kamis', null)
        .is('role_jumat', null);

    if (error) {
        console.error('Error checking missing snapshots:', error.message);
        return 0;
    }

    if (!data || data.length === 0) return 0;

    const magnitudeRegex = /magnitude\s+[1-9]/i;
    const missingUsers = data.filter(user => {
        if (!user.roles || !Array.isArray(user.roles)) return false;
        return user.roles.some(role => {
            const roleName = typeof role === 'string' ? role : role.name;
            return roleName && magnitudeRegex.test(roleName);
        });
    });

    if (missingUsers.length > 0) {
        console.log(`\nWARNING: Found ${missingUsers.length} users with Magnitude roles but missing snapshots.`);
        missingUsers.slice(0, 5).forEach(u => console.log(`   - ${u.username}: ${JSON.stringify(u.roles)}`));
    } else {
        console.log('\nData Integrity Check: All Magnitude users have snapshots.');
    }

    return missingUsers.length;
}

async function sanitizePromotions(options = {}) {
    if (!supabase) return;

    const tableName = getTableName(options);
    console.log(`\nSanitizing promotion data in "${tableName}"...`);

    const { data: likelyFalse, error } = await supabase
        .from(tableName)
        .select('user_id, username, role_kamis, role_jumat')
        .eq('is_promoted', true);

    if (error || !likelyFalse) {
        console.error('Error fetching promotion data:', error?.message);
        return;
    }

    const impostors = likelyFalse.filter(user => {
        if (user.role_kamis == null || user.role_jumat == null) return true;
        return Number(user.role_kamis) >= Number(user.role_jumat);
    });

    if (impostors.length === 0) {
        console.log('   No false promotions found. Data is clean.');
        return;
    }

    console.log(`   Found ${impostors.length} false promotions. Fixing...`);

    const impostorIds = impostors.map(user => user.user_id);
    const { error: updateError } = await supabase
        .from(tableName)
        .update({ is_promoted: false })
        .in('user_id', impostorIds);

    if (updateError) {
        console.error('   Failed to sanitize promotions:', updateError.message);
    } else {
        console.log(`   Successfully cleaned ${impostorIds.length} false records.`);
    }
}

module.exports = {
    supabase,
    saveToSupabase,
    getMembersFromSupabase,
    getLeaderboard,
    testConnection,
    checkMissingSnapshots,
    sanitizePromotions,
    ensureProjectTable,
    buildProjectTableSql,
    getCategoryColumnMap,
    normalizeIdentifier
};
