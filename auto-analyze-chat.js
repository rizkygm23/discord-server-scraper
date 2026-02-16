const MemberAnalytics = require('./analytics');
const { testConnection } = require('./supabase');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// ============================================
// CHAT CHANNEL CONFIGURATION (from .env)
// ============================================
const CHAT_CHANNEL_CATEGORIES = {};

if (process.env.GENERAL_CHANNEL) CHAT_CHANNEL_CATEGORIES["general"] = [process.env.GENERAL_CHANNEL];
if (process.env.MAGNITUDE_CHANNEL) CHAT_CHANNEL_CATEGORIES["magnitude"] = [process.env.MAGNITUDE_CHANNEL];
if (process.env.DEVNET_CHANNEL) CHAT_CHANNEL_CATEGORIES["devnet"] = [process.env.DEVNET_CHANNEL];
if (process.env.REPORT_CHANNEL) CHAT_CHANNEL_CATEGORIES["report"] = [process.env.REPORT_CHANNEL];

// Validate: at least 1 channel must be configured
if (Object.keys(CHAT_CHANNEL_CATEGORIES).length === 0) {
    console.error('🛑 No chat channels configured! Please set GENERAL_CHANNEL, MAGNITUDE_CHANNEL, DEVNET_CHANNEL, REPORT_CHANNEL in .env');
    process.exit(1);
}

console.log(`📡 Configured chat channels: ${Object.keys(CHAT_CHANNEL_CATEGORIES).join(', ')}`);

// ============================================
// SUPABASE CLIENT (separate instance)
// ============================================
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// ============================================
// SIMULATION / TEST MODE
// ============================================
// Set to true to test with only ONE user safely
const SIMULATION_MODE = false;
const TEST_USER = 'rizzgm'; // Username to filter for testing

// ============================================
// SAVE CHAT DATA TO SUPABASE
// ============================================
// IMPORTANT: This function ONLY updates the 4 chat columns + Basic Metadata.
// It DOES include username/display_name/roles to satisfy Database constraints for NEW users.
// It does NOT touch: tweet, art, total_messages, role_kamis, role_jumat, is_promoted, etc.
async function saveChatToSupabase(activityData) {
    if (!supabase) {
        console.log('⚠️ Supabase not configured, skipping chat data save.');
        return { success: 0, errors: 0, skipped: true };
    }

    console.log(`\n📤 Saving chat data for ${activityData.length} members to Supabase...`);

    let successCount = 0;
    let errorCount = 0;
    const batchSize = 100;

    // Transform data: 
    // We MUST include username/display_name/roles/is_bot to allow NEW users to be created so "NOT NULL" constraints don't fail.
    // For EXISTING users, this will update their name/roles to the latest, but keeps their stats intact.
    const records = activityData.map(member => ({
        user_id: member.userId,
        username: member.username,                 // REQUIRED by DB
        display_name: member.displayName,          // Good to have
        discriminator: member.discriminator || '0',
        roles: member.roles || [],                 // Useful to keep updated
        is_bot: member.isBot || false,

        // The 4 Chat Columns we actually want to update
        general_chat: member.activity.general || 0,
        magnitude_chat: member.activity.magnitude || 0,
        devnet_chat: member.activity.devnet || 0,
        report_chat: member.activity.report || 0,
    }));

    // Process in batches
    for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);

        try {
            // Upsert will insert new users or update existing ones
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

    console.log(`\n✅ Chat data save complete: ${successCount} success, ${errorCount} errors`);
    return { success: successCount, errors: errorCount, skipped: false };
}

// ============================================
// MAIN ANALYSIS FUNCTION
// ============================================
async function runChatAnalysis() {
    console.log(`\n🚀 Starting CHAT Analysis at ${new Date().toISOString()}`);
    console.log('   📋 Mode: Chat Channels Only');

    // 0. Test Database Connection
    const isDbConnected = await testConnection();
    if (!isDbConnected) {
        console.error('🛑 ABORTING: Database connection is not available.');
        return;
    }

    const startTime = Date.now();
    const analytics = new MemberAnalytics(CHAT_CHANNEL_CATEGORIES);

    try {
        await analytics.initialize();

        // 1. Fetch members (needed for role data)
        await analytics.getAllMembers();

        // =========================================================
        // STEP 1: PRE-FLIGHT SIMULATION (Test Save 50 Messages)
        // =========================================================
        console.log('\n🧪 STARTING PRE-FLIGHT CHECK (Simulation)...');
        console.log('   Scanning first 50 messages to verify database saving...');

        // Create a temporary config with just ONE channel for speed
        const testConfig = {};
        const firstCategory = Object.keys(CHAT_CHANNEL_CATEGORIES)[0];
        testConfig[firstCategory] = CHAT_CHANNEL_CATEGORIES[firstCategory];

        // Run with small limit
        const testActivityData = await analytics.analyzeActivity(testConfig, 50);

        if (testActivityData.length > 0) {
            console.log(`   Found ${testActivityData.length} active users in test batch.`);

            // Perform TEST SAVE
            const testResult = await saveChatToSupabase(testActivityData);

            if (testResult.errors > 0) {
                console.error('\n❌ PRE-FLIGHT CHECK FAILED!');
                console.error('   Database save returned errors. Aborting full scan to prevent wasting time.');
                console.error('   Please fix the database/code issues (e.g. check "username" or constraints).');
                return; // STOP HERE
            }

            console.log('   ✅ PRE-FLIGHT CHECK PASSED! Database save works correctly.');
        } else {
            console.warn('   ⚠️ Test batch found 0 messages. Skipping save test, but proceeding with caution.');
        }

        // =========================================================
        // STEP 2: FULL SCAN (Infinity)
        // =========================================================
        console.log('\n🚀 PROCEEDING TO FULL SCAN (Limit: Infinity)...');
        console.log('   (Counters will be reset and recalculated from scratch)');

        // Run full analysis
        // Note: analyzeActivity automatically resets counters internally
        const activityData = await analytics.analyzeActivity(CHAT_CHANNEL_CATEGORIES, Infinity);

        console.log(`\n📊 Chat Analysis Results (Full Scan):`);
        console.log(`   Total active chatters: ${activityData.length}`);

        // Count per category
        let generalCount = 0, magnitudeCount = 0, devnetCount = 0, reportCount = 0;
        activityData.forEach(m => {
            if (m.activity.general) generalCount++;
            if (m.activity.magnitude) magnitudeCount++;
            if (m.activity.devnet) devnetCount++;
            if (m.activity.report) reportCount++;
        });
        console.log(`   General chatters:   ${generalCount}`);
        console.log(`   Magnitude chatters: ${magnitudeCount}`);
        console.log(`   Devnet chatters:    ${devnetCount}`);
        console.log(`   Report chatters:    ${reportCount}`);

        // 3. Save FULL chat data
        await saveChatToSupabase(activityData);

        const duration = Date.now() - startTime;
        const hours = Math.floor(duration / 3600000);
        const minutes = Math.floor((duration % 3600000) / 60000);
        const seconds = ((duration % 60000) / 1000).toFixed(0);

        console.log(`\n✅ Chat Analysis Complete`);
        if (hours > 0) {
            console.log(`⏱️ Duration: ${hours}h ${minutes}m ${seconds}s`);
        } else {
            console.log(`⏱️ Duration: ${minutes}m ${seconds}s`);
        }

    } catch (error) {
        console.error('❌ Chat analysis failed:', error);
    } finally {
        await analytics.close();
    }
}

// ============================================
// MAIN LOOP (5 minute cooldown)
// ============================================
async function startLoop() {
    console.log('🤖 Discord Chat Analyzer Bot Started');
    console.log('   Channels: general, magnitude, devnet, report');
    console.log('   Running in continuous mode (5 minutes cooldown)');
    console.log('   ⚡ Safe to run alongside auto-analyze.js\n');

    // Run immediately
    await runChatAnalysis();
    scheduleNext();
}

const scheduleNext = () => {
    const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
    const nextDate = new Date(Date.now() + COOLDOWN_MS);

    console.log(`\n💤 Sleeping for 5.0 minutes`);
    console.log(`⏰ Next run scheduled for: ${nextDate.toUTCString()}`);

    setTimeout(async () => {
        await runChatAnalysis();
        scheduleNext();
    }, COOLDOWN_MS);
};

// Start
startLoop();
