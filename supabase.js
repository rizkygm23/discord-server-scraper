const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

/**
 * Supabase client for Discord Analytics
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Prioritize Service Role Key for backend writes to bypass RLS
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Supabase credentials not configured. Data will not be saved to database.');
}

const supabase = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

/**
 * Save member activity data to Supabase
 * @param {Array} activityData - Array of member activity objects
 * @returns {Object} - Result with success count and errors
 */
async function saveToSupabase(activityData) {
    if (!supabase) {
        console.log('⚠️ Supabase not configured, skipping database save.');
        return { success: 0, errors: 0, skipped: true };
    }

    console.log(`\n📤 Saving ${activityData.length} members to Supabase...`);

    let successCount = 0;
    let errorCount = 0;
    const batchSize = 100; // Insert in batches to avoid timeout

    // Transform data to match table schema
    // IMPORTANT: We must NOT include role_kamis/role_jumat/is_promoted if they are undefined
    // because Supabase will convert "undefined" to NULL and overwrite existing data!
    const records = activityData.map(member => {
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
            tweet: member.activity?.tweet || 0,
            art: member.activity?.art || 0,
            total_messages: member.totalMessages || 0,
            first_message_date: member.firstMessageDate || null,
            last_message_date: member.lastMessageDate || null,
            x_username: member.xUsername || null
        };

        // Only add these fields if they have actual values (not undefined/null)
        // This prevents Supabase from overwriting existing data with NULL
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

    // Process in batches
    for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);

        try {
            // Upsert: insert if not exists, update if exists
            const { data, error } = await supabase
                .from('seismic_dc_user')
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

    console.log(`\n✅ Supabase save complete: ${successCount} success, ${errorCount} errors`);

    return { success: successCount, errors: errorCount, skipped: false };
}

/**
 * Get all members from Supabase
 * @returns {Array} - Array of member records
 */
/**
 * Get all members from Supabase (Handles pagination for >1000 records)
 * @returns {Array} - Array of member records
 */
async function getMembersFromSupabase() {
    if (!supabase) {
        return [];
    }

    let allMembers = [];
    let from = 0;
    // FETCH ALMOST ALL AT ONCE (Max 20k limit)
    let step = 19999; // Fetch 20,000 records per batch (0-19999)
    let more = true;

    console.log('📥 Fetching existing members from Supabase...');

    while (more) {
        const { data, error } = await supabase
            .from('seismic_dc_user')
            .select('*')
            // IMPORTANT: Must verify sorting is deterministic!
            // Adding user_id as secondary sort ensures stable pagination
            .order('total_messages', { ascending: false })
            .order('user_id', { ascending: true })
            .range(from, from + step);

        if (error) {
            console.error(`Error fetching members (range ${from}-${from + step}):`, error.message);
            // Break loop on error to process partial data at least
            break;
        }

        if (data && data.length > 0) {
            allMembers = allMembers.concat(data);
            from += step + 1;

            // If we got less than the step + 1 (meaning full page), we are done
            if (data.length < 1000) {
                more = false;
            }

            // Log progress for large datasets
            process.stdout.write(`\r   Fetched ${allMembers.length} records...`);
        } else {
            more = false;
        }
    }

    console.log(`\n✅ Total members fetched: ${allMembers.length}`);
    return allMembers;
}

/**
 * Get leaderboard from Supabase
 * @param {string} category - 'tweet', 'art', 'total_messages'
 * @param {number} limit - Number of records to return
 * @returns {Array} - Leaderboard data
 */
async function getLeaderboard(category = 'total_messages', limit = 50) {
    if (!supabase) {
        return [];
    }

    const { data, error } = await supabase
        .from('seismic_dc_user')
        .select('*')
        .order(category, { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching leaderboard:', error.message);
        return [];
    }

    return data;
}



/**
 * Test Supabase connection
 * @returns {Promise<boolean>}
 */
async function testConnection() {
    if (!supabase) {
        console.error('❌ Supabase client is not initialized (missing URL or KEY).');
        return false;
    }

    try {
        console.log('📡 Testing connection to Supabase...');
        const { data, error, count } = await supabase
            .from('seismic_dc_user')
            .select('id', { count: 'exact', head: true });

        if (error) {
            console.error('❌ Supabase connection failed:', error.message);
            return false;
        }

        console.log(`✅ Connection successful! Found ${count} records in 'seismic_dc_user'.`);
        return true;
    } catch (err) {
        console.error('❌ Unexpected error during Supabase connection test:', err);
        return false;
    }
}

/**
 * Check for users who have Magnitude roles but are missing snapshots
 * @returns {Promise<number>} - Count of missing users
 */
async function checkMissingSnapshots() {
    if (!supabase) return 0;

    // Fetch users with NULL snapshots
    const { data, error } = await supabase
        .from('seismic_dc_user')
        .select('username, roles, role_kamis, role_jumat')
        .is('role_kamis', null)
        .is('role_jumat', null);

    if (error) {
        console.error('Error checking missing snapshots:', error.message);
        return 0;
    }

    if (!data || data.length === 0) return 0;

    // Filter locally for 'Magnitude' roles
    // Regex matches "Magnitude 1.0" or "magnitude 5" etc
    const magnitudeRegex = /magnitude\s+[1-9]/i;

    // We only care about users who actually HAVE a magnitude role
    // but somehow the scraper "Missed" snapshotting them.
    const missingUsers = data.filter(user => {
        if (!user.roles || !Array.isArray(user.roles)) return false;
        // Check if any role string matches the regex
        return user.roles.some(role => {
            const rName = typeof role === 'string' ? role : role.name;
            return rName && magnitudeRegex.test(rName);
        });
    });

    if (missingUsers.length > 0) {
        console.log(`\n⚠️  WARNING: Found ${missingUsers.length} users with Magnitude roles but MISSING snapshots!`);
        // Show first 5 examples
        missingUsers.slice(0, 5).forEach(u => console.log(`   - ${u.username}: ${JSON.stringify(u.roles)}`));
    } else {
        console.log('\n✅ Data Integrity Check: All Magnitude users have snapshots.');
    }

    return missingUsers.length;
}

module.exports = {
    supabase,
    saveToSupabase,
    getMembersFromSupabase,
    getLeaderboard,
    testConnection,
    checkMissingSnapshots
};
