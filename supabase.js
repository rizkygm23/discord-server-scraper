const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

/**
 * Supabase client for Discord Analytics
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
    const records = activityData.map(member => ({
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
        other: member.activity?.other || 0,
        total_messages: member.totalMessages || 0,
        first_message_date: member.firstMessageDate || null,
        last_message_date: member.lastMessageDate || null,
    }));

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
async function getMembersFromSupabase() {
    if (!supabase) {
        return [];
    }

    const { data, error } = await supabase
        .from('seismic_dc_user')
        .select('*')
        .order('total_messages', { ascending: false });

    if (error) {
        console.error('Error fetching from Supabase:', error.message);
        return [];
    }

    return data;
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

module.exports = {
    supabase,
    saveToSupabase,
    getMembersFromSupabase,
    getLeaderboard
};
