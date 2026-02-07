const MemberAnalytics = require('./analytics');
const { saveToSupabase, getMembersFromSupabase, testConnection, checkMissingSnapshots } = require('./supabase');
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
    // Regex for "Magnitude X.X" or just "Magnitude X"
    const regex = /^magnitude\s+(\d+(\.\d+)?)$/i;

    if (!roles || !Array.isArray(roles)) return null;

    roles.forEach(role => {
        // Handle both string array or object array with 'name' property
        const roleData = typeof role === 'string' ? role : role.name;

        if (!roleData) return;

        const roleName = roleData.trim(); // Trim whitespace
        const match = roleName.match(regex);

        if (match) {
            const val = parseFloat(match[1]);
            if (val > maxMag) maxMag = val;
        }
    });

    return maxMag > 0 ? maxMag : null;
}

// Helper to calculate time until next run (5 minutes cooldown)
function getTimeUntilNextRun() {
    const COOLDOWN_MINUTES = 5;
    return COOLDOWN_MINUTES * 60 * 1000;
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

    const startTime = Date.now();

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

        // 4. Apply Day-Specific Logic (Thursday/Friday)
        // Check current day in UTC
        const now = new Date();
        const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 4=Thu, 5=Fri

        // Fetch existing data to compare (e.g. for Friday comparison)
        const existingDBMembers = await getMembersFromSupabase();
        const existingMap = new Map(existingDBMembers.map(m => [m.user_id, m]));

        console.log(`\n📅 Today is UTC Day: ${dayOfWeek} (0=Sun, 4=Thu, 5=Fri)`);

        // Enrich activity data with snapshot logic
        const enrichedData = activityData.map(member => {
            const highestMag = getHighestMagnitude(member.roles);
            const existing = existingMap.get(member.userId);

            const updates = { ...member };

            if (dayOfWeek === 4) { // THURSDAY
                console.log(`   📸 Snapshotting Thursday Role for ${member.username}: ${highestMag}`);
                updates.roleKamis = highestMag;
            } else {
                // PRESERVE existing Thursday role if it's not Thursday
                // This prevents overwriting it with NULL during upserts
                if (existing && existing.role_kamis != null) {
                    updates.roleKamis = existing.role_kamis;
                }
            }

            if (dayOfWeek === 5) { // FRIDAY
                console.log(`   📸 Snapshotting Friday Role for ${member.username}: ${highestMag}`);
                updates.roleJumat = highestMag;

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
            } else {
                // PRESERVE existing Friday role & promotion status on other days
                if (existing) {
                    if (existing.role_jumat != null) updates.roleJumat = existing.role_jumat;
                    if (existing.is_promoted != null) updates.isPromoted = existing.is_promoted;
                }
            }

            return updates;
        });

        // 5. Save to Local Files (Backup)
        await analytics.saveResults(enrichedData);

        // 6. Save to Supabase
        await saveToSupabase(enrichedData);

        // 7. Data Integrity Check (Check for NULL Snapshots)
        // Only run this check if today is Thursday or Friday to verify the snapshot worked
        if (dayOfWeek === 4 || dayOfWeek === 5) {
            console.log('\n🔍 Running Data Integrity Check...');
            await checkMissingSnapshots();
        }

        const duration = Date.now() - startTime;
        const minutes = Math.floor(duration / 60000);
        const seconds = ((duration % 60000) / 1000).toFixed(0);

        console.log(`\n✅ Analysis Cycle Complete`);
        console.log(`⏱️ Duration: ${minutes}m ${seconds}s`);

    } catch (error) {
        console.error('❌ Analysis failed with error:', error);
    } finally {
        await analytics.close();
    }
}

// --- Main Loop ---
async function startLoop() {
    console.log('🤖 Discord Scraper Automation Bot Started');
    console.log('   Running in continuous mode (5 minutes cooldown)');

    // Run immediately on start
    await runAnalysis();
    scheduleNext();
}

const scheduleNext = () => {
    const msUntilNext = getTimeUntilNextRun();
    const nextDate = new Date(Date.now() + msUntilNext);

    console.log(`\n💤 Sleeping for ${(msUntilNext / 1000 / 60).toFixed(1)} minutes`);
    console.log(`⏰ Next run scheduled for: ${nextDate.toUTCString()}`);

    setTimeout(async () => {
        await runAnalysis();
        scheduleNext(); // Schedule the next one after completion
    }, msUntilNext);
};

// Start the engine
startLoop();
