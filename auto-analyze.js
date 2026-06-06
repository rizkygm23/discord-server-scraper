const MemberAnalytics = require('./analytics');
const {
    saveToSupabase,
    getMembersFromSupabase,
    testConnection,
    checkMissingSnapshots,
    sanitizePromotions,
    ensureProjectTable,
    normalizeIdentifier
} = require('./supabase');
const { loadProjectConfig, getProject } = require('./project-config');

const REGIONAL_ROLES = [
    'Ukrainian', 'Indian', 'Turkish', 'Russian', 'Indonesian',
    'Nigerian', 'Vietnamese', 'Pakistan', 'Philippines', 'Chinese',
    'Korean', 'Japanese', 'Bangladeshi', 'Iranian', 'Italian',
    'Brazilian', 'French', 'Thai', 'Polish', 'Portugal',
    'Singapore/Malaysia', 'Moroccan', 'Arabic', 'Egyptian'
];

function getHighestMagnitude(roles) {
    let maxMag = 0.0;
    const regex = /^magnitude\s+(\d+(\.\d+)?)$/i;

    if (!roles || !Array.isArray(roles)) return null;

    roles.forEach(role => {
        const roleName = (typeof role === 'string' ? role : role.name || '').trim();
        const match = roleName.match(regex);

        if (match) {
            const value = parseFloat(match[1]);
            if (value > maxMag) maxMag = value;
        }
    });

    return maxMag > 0 ? maxMag : null;
}

function getRegionalRole(roles) {
    if (!roles || !Array.isArray(roles)) return null;

    for (const role of roles) {
        const roleName = typeof role === 'string' ? role : role.name;
        if (!roleName) continue;

        const found = REGIONAL_ROLES.find(
            region => region.toLowerCase() === roleName.trim().toLowerCase()
        );
        if (found) return found;
    }

    return null;
}

function getDbOptions(project, activityData = []) {
    return {
        tableName: project.tableName,
        categories: Object.keys(project.channels || {}),
        outputDir: project.outputDir,
        activityData
    };
}

async function ensureDatabaseReady(project, options = {}) {
    const dbOptions = getDbOptions(project);
    const result = await ensureProjectTable({
        ...dbOptions,
        forceSchemaSync: options.forceSchemaSync || false
    });

    if (!result.success) {
        console.error(`Database table "${project.tableName}" is not ready.`);
        console.error(`Generated SQL: ${result.schemaPath}`);
        if (result.error) console.error(`Reason: ${result.error}`);
        return false;
    }

    return testConnection(dbOptions);
}

function enrichActivityData(activityData, existingMap, project, dayOfWeek) {
    const categories = Object.keys(project.channels || {});
    const features = project.features || {};

    return activityData.map(member => {
        const existing = existingMap.get(member.userId);
        const updates = { ...member };

        for (const category of categories) {
            const column = normalizeIdentifier(category, 'activity');
            updates[column] = member.activity?.[category] || 0;
        }

        updates.total_messages = member.totalMessages || 0;

        if (!updates.xUsername && existing && existing.x_username) {
            updates.xUsername = existing.x_username;
        }

        if (features.regionRole) {
            const region = getRegionalRole(member.roles);
            if (region) updates.region = region;
        }

        if (features.magnitudePromotion) {
            const highestMag = getHighestMagnitude(member.roles);

            if (dayOfWeek === 4) {
                console.log(`   Snapshotting Thursday role for ${member.username}: ${highestMag}`);
                updates.roleKamis = highestMag;
                updates.isPromoted = false;
            }

            if (dayOfWeek === 5) {
                console.log(`   Snapshotting Friday role for ${member.username}: ${highestMag}`);
                updates.roleJumat = highestMag;

                const prevKamis = existing ? existing.role_kamis : null;
                if (prevKamis !== null && highestMag !== null) {
                    updates.isPromoted = highestMag > prevKamis;
                    if (updates.isPromoted) {
                        console.log(`   PROMOTION DETECTED: ${member.username} (${prevKamis} -> ${highestMag})`);
                    }
                }
            }
        }

        return updates;
    });
}

function getTimezoneOffsetHours(schedule = {}) {
    if (Number.isFinite(schedule.timezoneOffsetHours)) {
        return schedule.timezoneOffsetHours;
    }

    if ((schedule.timezone || '').toUpperCase() === 'UTC') {
        return 0;
    }

    return 7;
}

function getTimeUntilNextRun(projects) {
    const now = Date.now();

    return Math.min(...projects.map(project => {
        const schedule = project.schedule || {};
        const offsetMs = getTimezoneOffsetHours(schedule) * 3600 * 1000;

        for (let i = 0; i <= 7; i++) {
            const evalTimeMs = now + (i * 24 * 3600 * 1000) + offsetMs;
            const evalDate = new Date(evalTimeMs);
            const year = evalDate.getUTCFullYear();
            const month = evalDate.getUTCMonth();
            const date = evalDate.getUTCDate();
            const day = evalDate.getUTCDay();
            const targetHour = day === 5
                ? (schedule.fridayHour ?? schedule.defaultHour ?? 7)
                : (schedule.defaultHour ?? 7);
            const targetMs = Date.UTC(year, month, date, targetHour - getTimezoneOffsetHours(schedule), 0, 0, 0);

            if (targetMs > now) {
                return targetMs - now;
            }
        }

        return 24 * 3600 * 1000;
    }));
}

async function runAnalysis(project, overrideDay = null) {
    console.log(`\nStarting analysis for project "${project.key}" at ${new Date().toISOString()}`);
    console.log(`   Server ID: ${project.serverId}`);
    console.log(`   Table: ${project.tableName}`);
    console.log(`   Channels: ${Object.keys(project.channels || {}).join(', ')}`);

    if (overrideDay !== null) {
        const dayLabel = overrideDay === 4 ? 'KAMIS' : overrideDay === 5 ? 'JUMAT' : 'BIASA';
        console.log(`   Manual day override: ${dayLabel}`);
    }

    const dbReady = await ensureDatabaseReady(project);
    if (!dbReady) {
        console.error(`Aborting project "${project.key}" because database is not ready.`);
        return;
    }

    const startTime = Date.now();
    const analytics = new MemberAnalytics(project.channels, {
        projectKey: project.key,
        serverId: project.serverId,
        outputDir: project.outputDir,
        stateDir: project.stateDir
    });

    try {
        await analytics.initialize();
        await analytics.getAllMembers();

        console.log('\nStarting activity analysis (incremental + checkpoint mode)...');
        const activityData = await analytics.analyzeActivity(project.channels, project.messageLimit);
        const dayOfWeek = overrideDay !== null ? overrideDay : new Date().getUTCDay();

        const dbOptions = getDbOptions(project, activityData);
        const existingDBMembers = await getMembersFromSupabase(dbOptions);
        const existingMap = new Map(existingDBMembers.map(member => [member.user_id, member]));

        console.log(`\nToday is UTC day: ${dayOfWeek} (0=Sun, 4=Thu, 5=Fri)`);
        const enrichedData = enrichActivityData(activityData, existingMap, project, dayOfWeek);

        await analytics.saveResults(enrichedData);
        await saveToSupabase(enrichedData, dbOptions);

        if (project.features?.magnitudePromotion && (dayOfWeek === 4 || dayOfWeek === 5)) {
            console.log('\nRunning data integrity check...');
            await checkMissingSnapshots(dbOptions);
        }

        if (project.features?.sanitizePromotions) {
            await sanitizePromotions(dbOptions);
        }

        const duration = Date.now() - startTime;
        const minutes = Math.floor(duration / 60000);
        const seconds = ((duration % 60000) / 1000).toFixed(0);

        console.log(`\nAnalysis cycle complete for "${project.key}"`);
        console.log(`Duration: ${minutes}m ${seconds}s`);
    } catch (error) {
        console.error(`Analysis failed for project "${project.key}":`, error);
    } finally {
        await analytics.close();
    }
}

function parseArgs() {
    const rawArgs = process.argv.slice(2);
    const args = {
        projectKey: null,
        all: false,
        initDb: false,
        list: false,
        once: false,
        overrideDay: null
    };

    for (let i = 0; i < rawArgs.length; i++) {
        const arg = rawArgs[i];
        const normalized = arg.toLowerCase();

        if (normalized === '--all') args.all = true;
        if (normalized === '--init-db') args.initDb = true;
        if (normalized === '--list') args.list = true;
        if (normalized === '--once') args.once = true;
        if (normalized === '--kamis' || normalized === 'kamis') args.overrideDay = 4;
        if (normalized === '--jumat' || normalized === 'jumat') args.overrideDay = 5;
        if (normalized === '--biasa' || normalized === 'biasa') args.overrideDay = 0;

        if (normalized === '--project' || normalized === '-p') {
            args.projectKey = rawArgs[i + 1];
            i++;
        } else if (normalized.startsWith('--project=')) {
            args.projectKey = arg.slice('--project='.length);
        }
    }

    if (args.overrideDay !== null) {
        args.once = true;
    }

    return args;
}

function selectProjects(args) {
    const config = loadProjectConfig();
    if (args.all) return config.projects;
    return [getProject(args.projectKey || config.defaultProject)];
}

async function runProjectsOnce(projects, overrideDay = null) {
    for (const project of projects) {
        await runAnalysis(project, overrideDay);
    }
}

async function initDatabases(projects) {
    for (const project of projects) {
        console.log(`\nInitializing database for project "${project.key}" (${project.tableName})...`);
        const result = await ensureProjectTable({
            ...getDbOptions(project),
            forceSchemaSync: true
        });

        if (result.success) {
            console.log(`Database ready for "${project.key}". SQL file: ${result.schemaPath}`);
        } else {
            console.error(`Database still needs manual SQL for "${project.key}". SQL file: ${result.schemaPath}`);
            if (result.error) console.error(`Reason: ${result.error}`);
        }
    }
}

async function startLoop(projects) {
    console.log('Discord scraper automation started');
    console.log(`Projects: ${projects.map(project => project.key).join(', ')}`);

    await runProjectsOnce(projects);
    scheduleNext(projects);
}

function scheduleNext(projects) {
    const msUntilNext = getTimeUntilNextRun(projects);
    const nextDate = new Date(Date.now() + msUntilNext);
    const wibDate = new Date(nextDate.getTime() + 7 * 3600 * 1000);
    const wibStr = wibDate.toISOString().replace('T', ' ').substring(0, 16) + ' WIB';

    console.log(`\nSleeping for ${(msUntilNext / 1000 / 3600).toFixed(2)} hours`);
    console.log(`Next run scheduled for: ${nextDate.toUTCString()} (${wibStr})`);

    setTimeout(async () => {
        await runProjectsOnce(projects);
        scheduleNext(projects);
    }, msUntilNext);
}

async function main() {
    const args = parseArgs();

    if (args.list) {
        loadProjectConfig().projects.forEach(project => {
            console.log(`${project.key}: server=${project.serverId}, table=${project.tableName}`);
        });
        return;
    }

    const projects = selectProjects(args);

    if (args.initDb) {
        await initDatabases(projects);
        return;
    }

    if (args.once) {
        await runProjectsOnce(projects, args.overrideDay);
        return;
    }

    await startLoop(projects);
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
