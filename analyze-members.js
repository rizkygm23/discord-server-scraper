const MemberAnalytics = require('./analytics');
require('dotenv').config();

/**
 * ============================================
 * CHANNEL CONFIGURATION
 * ============================================
 * 
 * Channel ID Anda sudah dikonfigurasi di bawah.
 * "all_messages" akan otomatis mengambil SEMUA channel di server.
 */
const CHANNEL_CATEGORIES = {
    // Channel untuk post tweet/twitter
    "tweet": [
        "1347351535071400047",  // Tweet channel
    ],

    // Channel untuk art submissions  
    "art": [
        "1349784473956257914",  // Art channel
    ],

    // "all_messages" akan di-handle khusus - mengambil SEMUA channel
};

// Set true untuk juga menghitung SEMUA pesan di seluruh server
const INCLUDE_ALL_CHANNELS = true;

// Berapa banyak pesan yang ingin diambil per channel (max)
const MESSAGE_LIMIT = 10000;

/**
 * Main function
 */
async function main() {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║     DISCORD MEMBER ACTIVITY ANALYZER       ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log('');

    console.log('📋 Configuration:');
    console.log(`   Server ID: ${process.env.SERVER_ID || 'Not set!'}`);
    console.log(`   Message Limit: ${MESSAGE_LIMIT} per channel`);
    console.log(`   Include All Channels: ${INCLUDE_ALL_CHANNELS}`);
    console.log('');

    const analytics = new MemberAnalytics();

    try {
        // Step 1: Initialize and login
        console.log('🔐 Connecting to Discord...');
        await analytics.initialize();
        console.log('');

        // Step 2: Fetch all members with roles
        console.log('👥 Fetching member list...');
        const members = await analytics.getAllMembers();
        console.log('');

        // Step 3: Get all text channels if INCLUDE_ALL_CHANNELS is true
        let channelsToAnalyze = { ...CHANNEL_CATEGORIES };

        if (INCLUDE_ALL_CHANNELS) {
            console.log('📂 Fetching all text channels for total message count...');
            const allChannels = await analytics.getAllTextChannels();

            // Add all channels under "all_messages" category
            // But exclude the ones already in tweet/art to avoid double counting
            const excludeIds = new Set([
                ...CHANNEL_CATEGORIES.tweet,
                ...CHANNEL_CATEGORIES.art
            ]);

            const otherChannelIds = allChannels
                .filter(ch => !excludeIds.has(ch.id))
                .map(ch => ch.id);

            channelsToAnalyze["other"] = otherChannelIds;

            console.log(`   Found ${allChannels.length} text channels total`);
            console.log(`   Tweet channel(s): ${CHANNEL_CATEGORIES.tweet.length}`);
            console.log(`   Art channel(s): ${CHANNEL_CATEGORIES.art.length}`);
            console.log(`   Other channels: ${otherChannelIds.length}`);
            console.log('');
        }

        // Step 4: Analyze activity in all channels
        console.log('📊 Analyzing activity (this may take a while)...');
        const activityData = await analytics.analyzeActivity(channelsToAnalyze, MESSAGE_LIMIT);
        console.log('');

        // Step 5: Save results
        console.log('💾 Saving results...');
        await analytics.saveResults(activityData);

        // Step 6: Show quick summary
        console.log('\n');
        console.log('╔════════════════════════════════════════════╗');
        console.log('║              QUICK SUMMARY                 ║');
        console.log('╚════════════════════════════════════════════╝');
        console.log('');
        console.log(`Total Members: ${members.length}`);
        console.log(`Active Members: ${activityData.length}`);
        console.log('');

        // Show top 10 for tweet
        const tweetLeaderboard = analytics.generateLeaderboard('tweet', 10);
        if (tweetLeaderboard.length > 0) {
            console.log('🐦 Top 10 - TWEET POSTS');
            console.log('-'.repeat(45));
            tweetLeaderboard.forEach(entry => {
                console.log(`  ${entry.rank.toString().padStart(2)}. ${entry.displayName.substring(0, 25).padEnd(25)} - ${entry.count}`);
            });
            console.log('');
        }

        // Show top 10 for art
        const artLeaderboard = analytics.generateLeaderboard('art', 10);
        if (artLeaderboard.length > 0) {
            console.log('🎨 Top 10 - ART SUBMISSIONS');
            console.log('-'.repeat(45));
            artLeaderboard.forEach(entry => {
                console.log(`  ${entry.rank.toString().padStart(2)}. ${entry.displayName.substring(0, 25).padEnd(25)} - ${entry.count}`);
            });
            console.log('');
        }

        // Show top 10 by total messages
        console.log('💬 Top 10 - TOTAL MESSAGES (All Channels)');
        console.log('-'.repeat(45));
        activityData.slice(0, 10).forEach((member, index) => {
            console.log(`  ${(index + 1).toString().padStart(2)}. ${member.displayName.substring(0, 25).padEnd(25)} - ${member.totalMessages}`);
        });
        console.log('');

        console.log('✅ Analysis complete! Check the analytics/ folder for full results.');
        console.log('');
        console.log('📁 Output files:');
        console.log('   - analytics/member_activity.json  (full data)');
        console.log('   - analytics/members.json          (all members + roles)');
        console.log('   - analytics/leaderboards.json     (per category)');
        console.log('   - analytics/activity_data.csv     (for Excel)');
        console.log('   - analytics/activity_report.txt   (readable report)');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        await analytics.close();
    }
}

// Run
main().catch(console.error);
