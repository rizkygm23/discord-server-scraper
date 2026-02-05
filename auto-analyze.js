const MemberAnalytics = require('./analytics');
const { saveToSupabase, getMembersFromSupabase, testConnection } = require('./supabase');
const config = require('./config');

// Hardcoded Channel Configuration (copied from analyze-members.js)
const CHANNEL_CATEGORIES = {
    // Channel untuk post tweet/twitter
    "tweet": [
        "1347351535071400047",  // Tweet channel
    ],

    // Channel untuk art submissions  
    "art": [
        "1349784473956257914",  // Art channel
    ]
};

// Helper to extract highest magnitude from role list
function getHighestMagnitude(roles) {
    let maxMag = 0.0;
    const regex = /^Magnitude (\d+(\.\d+)?)$/;

    if (!roles || !Array.isArray(roles)) return null;

    roles.forEach(role => {
        // Handle both string array or object array with 'name' property
        const roleName = typeof role === 'string' ? role : role.name;

        const match = roleName.match(regex);
        if (match) {
            const val = parseFloat(match[1]);
            if (val > maxMag) maxMag = val;
        }
    });

    return maxMag > 0 ? maxMag : null;
}

// Helper to calculate time until next 00:00 UTC
function getTimeUntilNextRun() {
    const now = new Date();
    const target = new Date(now);

    // Set to next 00:00 UTC
    target.setUTCHours(24, 0, 0, 0);

    return target.getTime() - now.getTime();
}

async function runAnalysis() {
    console.log(`\n🚀 Starting Scheduled Analysis at ${new Date().toISOString()}`);

    // 0. Test Database Connection FIRST
    const isDbConnected = await testConnection();
    if (!isDbConnected) {
        console.error('🛑 ABORTING ANALYSIS: Database connection is not available.');
        console.error('   Please check your .env file and Supabase project status.');
        return; // Stop execution here
    }

    const analytics = new MemberAnalytics(CHANNEL_CATEGORIES);

    try {
        await analytics.initialize();

        // 1. Fetch all members and text channels
        const members = await analytics.getAllMembers();

        // 2. Refresh channel lists based on category
        // NOTE: This assumes CHANNEL_CATEGORIES contains IDs or names
        // Ideally we resolve them to actual IDs if they aren't already

        // 3. Analyze Activity
        const activityData = await analytics.analyzeActivity(CHANNEL_CATEGORIES, Infinity);

        // 4. Apply Day-Specific Logic (Thursday/Saturday)
        // Check current day in UTC
        const now = new Date();
        const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 4=Thu, 6=Sat

        // Fetch existing data to compare (e.g. for Saturday comparison)
        const existingDBMembers = await getMembersFromSupabase();
        const existingMap = new Map(existingDBMembers.map(m => [m.user_id, m]));

        console.log(`\n📅 Today is UTC Day: ${dayOfWeek} (0=Sun, 4=Thu, 6=Sat)`);

        // Enrich activity data with snapshot logic
        const enrichedData = activityData.map(member => {
            const highestMag = getHighestMagnitude(member.roles);
            const existing = existingMap.get(member.userId);

            const updates = { ...member };

            if (dayOfWeek === 4) { // THURSDAY
                console.log(`   📸 Snapshotting Thursday Role for ${member.username}: ${highestMag}`);
                updates.roleKamis = highestMag;
            }
            else if (dayOfWeek === 6) { // SATURDAY
                console.log(`   📸 Snapshotting Saturday Role for ${member.username}: ${highestMag}`);
                updates.roleSabtu = highestMag;

                // Compare Logic
                // We need the PREVIOUS Thursday's role. 
                // Checks if we have it in DB (from existingMap)
                const prevKamis = existing ? existing.role_kamis : null;

                if (prevKamis !== null && highestMag !== null) {
                    if (highestMag > prevKamis) {
                        console.log(`   🎉 PROMOTION DETECTED: ${member.username} (${prevKamis} -> ${highestMag})`);
                        updates.isPromoted = true;
                    } else {
                        updates.isPromoted = false;
                    }
                }
            }

            return updates;
        });

        // 5. Save to Local Files (Backup)
        await analytics.saveResults(enrichedData);

        // 6. Save to Supabase
        await saveToSupabase(enrichedData);

        console.log('\n✅ Analysis Cycle Complete');

    } catch (error) {
        console.error('❌ Analysis failed with error:', error);
    } finally {
        await analytics.close();
    }
}

// --- Main Loop ---
async function startLoop() {
    console.log('🤖 Discord Scraper Automation Bot Started');
    console.log('   Waiting for next scheduled run (00:00 UTC)...');

    // Run immediately on start? 
    // Uncomment next line if you want to run once immediately for testing
    // await runAnalysis();

    const checkInterval = setInterval(async () => {
        const now = new Date();

        // Check if it's 00:00 UTC (with 1 minute tolerance window)
        // We use a flag or just check minutes to avoid double-running
        if (now.getUTCHours() === 0 && now.getUTCMinutes() === 0) {
            console.log('⏰ It is 00:00 UTC! Triggering analysis...');
            await runAnalysis();

            // Wait 61 seconds to ensure we don't double trigger in the same minute
            // But since this is inside an interval, we just need to be careful.
            // A better way is Calculate Timeout for next run.
        }
    }, 60000); // Check every minute

    // Better Approach: Calculate precise timeout
    const scheduleNext = async () => {
        const msUntilNext = getTimeUntilNextRun();
        const nextDate = new Date(Date.now() + msUntilNext);

        console.log(`\n💤 Sleeping for ${(msUntilNext / 1000 / 3600).toFixed(2)} hours`);
        console.log(`⏰ Next run scheduled for: ${nextDate.toUTCString()}`);

        setTimeout(async () => {
            await runAnalysis();
            scheduleNext(); // Schedule the next one after completion
        }, msUntilNext);
    };

    // First run logic: 
    // Do you want to run NOW or wait for midnight?
    // User requested "analyze ulang setiap hari sekali di jam 00:00 UTC otomatis"
    // Usually implies "Start now, then loop" OR "Wait for first midnight".
    // I will trigger one run NOW to verify, then schedule loop.

    console.log('🏁 Initializing first run...');
    await runAnalysis();
    scheduleNext();
}

// Start the engine
startLoop();
