const fs = require('fs-extra');
const path = require('path');
const { Client } = require('discord.js-selfbot-v13');
const config = require('./config');
const utils = require('./utils');
const { getDiscordToken } = require('./auth');

// ============================================
// TERMINAL ANIMATION UTILITIES
// ============================================
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const progressChars = { filled: '█', empty: '░' };

class TerminalProgress {
    constructor() {
        this.spinnerIndex = 0;
        this.startTime = Date.now();
        this.lastUpdate = 0;
    }

    getSpinner() {
        this.spinnerIndex = (this.spinnerIndex + 1) % spinnerFrames.length;
        return spinnerFrames[this.spinnerIndex];
    }

    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    formatTime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    getProgressBar(current, total, width = 20) {
        const percentage = total > 0 ? Math.min(current / total, 1) : 0;
        const filled = Math.round(width * percentage);
        const empty = width - filled;
        const bar = progressChars.filled.repeat(filled) + progressChars.empty.repeat(empty);
        const percent = Math.round(percentage * 100);
        return `[${bar}] ${percent}%`;
    }

    getSpeed(count) {
        const elapsed = (Date.now() - this.startTime) / 1000;
        const speed = elapsed > 0 ? Math.round(count / elapsed) : 0;
        return `${speed}/s`;
    }

    update(message) {
        // Only update every 100ms to prevent flickering
        const now = Date.now();
        if (now - this.lastUpdate < 100) return;
        this.lastUpdate = now;

        // Clear line and write new content
        process.stdout.write(`\r\x1b[K${message}`);
    }

    finish(message) {
        process.stdout.write(`\r\x1b[K${message}\n`);
    }

    reset() {
        this.startTime = Date.now();
        this.spinnerIndex = 0;
    }
}

const progress = new TerminalProgress();


/**
 * Discord Member Analytics
 * Tracks member activity across different channel categories
 */
class MemberAnalytics {
    constructor(channelConfig = {}, options = {}) {
        this.client = new Client({
            checkUpdate: false,
        });
        this.serverId = options.serverId || config.serverId;
        this.projectKey = options.projectKey || 'default';
        this.outputDir = options.outputDir || config.outputDir;
        this.stateDir = options.stateDir || __dirname;
        this.legacyStateDir = options.legacyStateDir || __dirname;
        this.initialized = false;

        // Channel configuration for tracking
        // Example: { "tweet": ["channel_id_1"], "art": ["channel_id_2"] }
        this.channelConfig = channelConfig;

        // Store all member data
        this.members = new Map();

        // Store activity data per member
        this.memberActivity = new Map();
        // Track channel statistics
        this.channelStats = [];

        // Checkpoint file path
        this.checkpointFile = path.join(this.stateDir, 'channel_checkpoints.json');

        // Directory for per-channel checkpoint data files
        this.checkpointDataDir = this.stateDir;

        // Persistent cache for users resolved by refetchMissingMembers()
        this.refetchCacheFile = path.join(this.stateDir, 'member_refetch_cache.json');

        fs.ensureDirSync(this.stateDir);
        this.migrateLegacyStateFiles();

        this.checkpoints = this.loadCheckpoints();
        this.refetchCache = this.loadRefetchCache();
        this.refetchCacheDirty = false;
        this.refetchCacheHits = 0;
    }

    loadCheckpoints() {
        try {
            if (fs.existsSync(this.checkpointFile)) {
                const content = fs.readFileSync(this.checkpointFile, 'utf8').trim();
                if (content) {
                    const data = JSON.parse(content);
                    console.log(`   📍 Loaded checkpoints for ${Object.keys(data).length} channels`);
                    return data;
                }
            }
        } catch (err) {
            console.error('Error loading checkpoints:', err);
        }
        return {};
    }

    saveCheckpoints() {
        try {
            fs.ensureDirSync(this.stateDir);
            fs.writeFileSync(this.checkpointFile, JSON.stringify(this.checkpoints, null, 2));
        } catch (err) {
            console.error('Error saving checkpoints:', err);
        }
    }

    migrateLegacyStateFiles() {
        try {
            if (!this.stateDir || this.stateDir === this.legacyStateDir) {
                return;
            }

            const legacyCheckpointFile = path.join(this.legacyStateDir, 'channel_checkpoints.json');
            if (!fs.existsSync(this.checkpointFile) && fs.existsSync(legacyCheckpointFile)) {
                fs.copyFileSync(legacyCheckpointFile, this.checkpointFile);
                console.log(`   Migrated legacy checkpoint file to ${this.checkpointFile}`);
            }

            const legacyCacheFile = path.join(this.legacyStateDir, 'member_refetch_cache.json');
            if (!fs.existsSync(this.refetchCacheFile) && fs.existsSync(legacyCacheFile)) {
                fs.copyFileSync(legacyCacheFile, this.refetchCacheFile);
                console.log(`   Migrated legacy refetch cache to ${this.refetchCacheFile}`);
            }

            for (const channelIds of Object.values(this.channelConfig || {})) {
                for (const channelId of channelIds || []) {
                    const legacyChannelFile = path.join(this.legacyStateDir, `${channelId}_checkpoint.json`);
                    const stateChannelFile = path.join(this.stateDir, `${channelId}_checkpoint.json`);
                    if (!fs.existsSync(stateChannelFile) && fs.existsSync(legacyChannelFile)) {
                        fs.copyFileSync(legacyChannelFile, stateChannelFile);
                        console.log(`   Migrated legacy channel checkpoint for ${channelId}`);
                    }
                }
            }
        } catch (err) {
            console.error('Error migrating legacy state files:', err.message);
        }
    }

    loadRefetchCache() {
        const cache = new Map();

        try {
            if (!fs.existsSync(this.refetchCacheFile)) {
                return cache;
            }

            const content = fs.readFileSync(this.refetchCacheFile, 'utf8').trim();
            if (!content) {
                return cache;
            }

            const data = JSON.parse(content);
            const serverId = this.serverId || 'default';
            const serverCache = data.servers?.[serverId] || data[serverId] || data.users || {};

            for (const [userId, entry] of Object.entries(serverCache)) {
                if (entry && typeof entry === 'object' && entry.status) {
                    cache.set(userId, entry);
                }
            }

            console.log(`   Loaded refetch cache for ${cache.size.toLocaleString()} users`);
        } catch (err) {
            console.error('Error loading refetch cache:', err.message);
        }

        return cache;
    }

    saveRefetchCache(options = {}) {
        const { silent = false } = options;

        try {
            let data = { version: 1, servers: {} };

            if (fs.existsSync(this.refetchCacheFile)) {
                const content = fs.readFileSync(this.refetchCacheFile, 'utf8').trim();
                if (content) {
                    const existing = JSON.parse(content);
                    if (existing && typeof existing === 'object' && existing.servers) {
                        data = existing;
                    }
                }
            }

            if (!data.servers || typeof data.servers !== 'object') {
                data.servers = {};
            }

            const serverId = this.serverId || 'default';
            data.version = 1;
            data.updatedAt = new Date().toISOString();
            data.servers[serverId] = Object.fromEntries(this.refetchCache);

            fs.ensureDirSync(this.stateDir);
            fs.writeFileSync(this.refetchCacheFile, JSON.stringify(data, null, 2));
            this.refetchCacheDirty = false;

            if (!silent) {
                console.log(`  Refetch cache saved: ${this.refetchCache.size.toLocaleString()} users`);
            }
        } catch (err) {
            console.error('Error saving refetch cache:', err.message);
        }
    }

    normalizeRoleNames(roles) {
        if (!Array.isArray(roles)) return [];

        return roles
            .map(role => typeof role === 'string' ? role : role?.name)
            .filter(Boolean);
    }

    cacheDate(value) {
        if (!value) return null;
        return value.toISOString ? value.toISOString() : value;
    }

    createMemberCacheEntry(userId, member, roles) {
        const roleNames = roles.length > 0 ? roles : ['No Roles'];

        return {
            status: 'found',
            cachedAt: new Date().toISOString(),
            userId,
            username: member.user.username,
            displayName: member.displayName,
            discriminator: member.user.discriminator || '0',
            avatar: member.user.avatarURL({ dynamic: true, size: 512 }),
            accentColor: member.user.accentColor || null,
            roles: roleNames,
            isBot: member.user.bot || false,
            joinedAt: this.cacheDate(member.joinedAt),
            createdAt: this.cacheDate(member.user.createdAt),
            customStatus: null,
            connectedAccounts: []
        };
    }

    createLeftServerCacheEntry(userId, activity, error) {
        return {
            status: 'left',
            cachedAt: new Date().toISOString(),
            userId,
            username: activity.username,
            displayName: activity.displayName,
            discriminator: activity.discriminator || '0',
            avatar: activity.avatar || null,
            accentColor: activity.accentColor || null,
            roles: ['[Left Server]'],
            isBot: false,
            joinedAt: activity.joinedAt || null,
            createdAt: activity.createdAt || null,
            errorCode: error?.code || null,
            errorMessage: error?.message || null
        };
    }

    memberDataFromCacheEntry(userId, entry) {
        const roleNames = this.normalizeRoleNames(entry.roles);

        return {
            id: userId,
            username: entry.username,
            displayName: entry.displayName || entry.username,
            discriminator: entry.discriminator || '0',
            avatar: entry.avatar || null,
            accentColor: entry.accentColor || null,
            roles: roleNames,
            roleNames: roleNames.length > 0 ? roleNames : ['No Roles'],
            joinedAt: entry.joinedAt || null,
            createdAt: entry.createdAt || null,
            isBot: entry.isBot || false,
            customStatus: entry.customStatus || null,
            connectedAccounts: entry.connectedAccounts || []
        };
    }

    applyRefetchCacheEntry(activity, userId, entry) {
        if (!entry || !entry.status) return false;

        if (entry.status === 'found') {
            const memberData = this.memberDataFromCacheEntry(userId, entry);
            this.members.set(userId, memberData);

            activity.username = memberData.username || activity.username;
            activity.displayName = memberData.displayName || activity.displayName;
            activity.discriminator = memberData.discriminator || activity.discriminator || '0';
            activity.avatar = memberData.avatar || activity.avatar || null;
            activity.accentColor = memberData.accentColor || activity.accentColor || null;
            activity.roles = memberData.roleNames;
            activity.isBot = memberData.isBot || false;
            activity.joinedAt = memberData.joinedAt || null;
            activity.createdAt = memberData.createdAt || null;
            activity.customStatus = memberData.customStatus || null;
            activity.connectedAccounts = memberData.connectedAccounts || [];
            return true;
        }

        if (entry.status === 'left') {
            activity.username = entry.username || activity.username;
            activity.displayName = entry.displayName || activity.displayName;
            activity.discriminator = entry.discriminator || activity.discriminator || '0';
            activity.avatar = entry.avatar || activity.avatar || null;
            activity.accentColor = entry.accentColor || activity.accentColor || null;
            activity.roles = ['[Left Server]'];
            activity.isBot = false;
            activity.joinedAt = entry.joinedAt || activity.joinedAt || null;
            activity.createdAt = entry.createdAt || activity.createdAt || null;
            return true;
        }

        return false;
    }

    /**
     * Load existing per-channel checkpoint data from {channelId}_checkpoint.json
     * @param {string} channelId
     * @returns {Array} Previously saved messages for this channel
     */
    loadChannelCheckpointData(channelId) {
        const filePath = path.join(this.checkpointDataDir, `${channelId}_checkpoint.json`);
        try {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8').trim();
                if (content) {
                    const data = JSON.parse(content);
                    console.log(`   📂 Loaded ${data.length.toLocaleString()} existing messages from ${channelId}_checkpoint.json`);
                    return data;
                }
            }
        } catch (err) {
            console.error(`   ⚠️ Error loading checkpoint data for ${channelId}:`, err.message);
        }
        return [];
    }

    /**
     * Save per-channel checkpoint data to {channelId}_checkpoint.json
     * Merges new messages with existing ones, deduplicates, and sorts newest-first.
     * This ensures NO data is ever lost between incremental runs.
     *
     * @param {string} channelId
     * @param {Array} newMessages - Newly fetched messages (since last checkpoint)
     * @param {Array} existingMessages - Previously saved messages
     * @returns {Array} The merged, deduplicated list
     */
    saveChannelCheckpointData(channelId, newMessages, existingMessages) {
        const filePath = path.join(this.checkpointDataDir, `${channelId}_checkpoint.json`);
        try {
            // Merge: new messages first (newest), then existing
            const allMessages = [...newMessages, ...existingMessages];

            // Deduplicate using a composite key (authorId + timestamp + content prefix)
            const seen = new Set();
            const deduplicated = [];
            for (const msg of allMessages) {
                const ts = new Date(msg.createdAt).getTime();
                const key = `${msg.authorId}_${ts}_${(msg.content || '').substring(0, 50)}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    deduplicated.push(msg);
                }
            }

            // Sort by createdAt descending (newest first)
            deduplicated.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            fs.writeFileSync(filePath, JSON.stringify(deduplicated, null, 2));

            const dupsRemoved = allMessages.length - deduplicated.length;
            console.log(`   💾 Saved ${deduplicated.length.toLocaleString()} total messages to ${channelId}_checkpoint.json`);
            console.log(`      (${newMessages.length.toLocaleString()} new + ${existingMessages.length.toLocaleString()} existing, ${dupsRemoved} duplicates removed)`);

            return deduplicated;
        } catch (err) {
            console.error(`   ⚠️ Error saving checkpoint data for ${channelId}:`, err.message);
            return [...newMessages, ...existingMessages];
        }
    }

    async initialize() {
        let token = config.userToken;

        try {
            if (fs.existsSync('discord_token.txt')) {
                const savedToken = fs.readFileSync('discord_token.txt', 'utf8').trim();
                if (savedToken) {
                    console.log('Found saved token, using it...');
                    token = savedToken;
                }
            }
        } catch (err) {
            console.error('Failed to read saved token:', err);
        }

        if (!token && config.email && config.password) {
            console.log('No token found, attempting login with email/password...');
            try {
                token = await getDiscordToken(config.email, config.password);
                console.log('Token acquired successfully!');
            } catch (error) {
                throw new Error(`Failed to acquire token: ${error.message}`);
            }
        } else if (!token) {
            throw new Error('No Discord token or email/password provided. Check your .env file.');
        }

        if (!this.serverId) {
            throw new Error('Server ID not provided. Check your .env file.');
        }

        await utils.ensureDir(this.outputDir);
        await utils.ensureDir(this.stateDir);

        this.client.on('ready', () => {
            console.log(`Logged in as ${this.client.user.tag}!`);
            this.initialized = true;
        });

        await this.client.login(token);

        await new Promise(resolve => {
            const checkInterval = setInterval(() => {
                if (this.initialized) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        });
    }

    /**
     * Get all members from the server with their roles and extended info
     * For large servers (50k+), skips full fetch and relies on per-message fetching
     */
    async getAllMembers() {
        console.log('👥 Preparing member data...');

        const guild = await this.client.guilds.fetch(this.serverId);
        if (!guild) {
            throw new Error(`Server ID ${this.serverId} not found`);
        }

        this.guild = guild; // Store for later use
        const expectedCount = guild.memberCount;
        console.log(`   Server: ${guild.name}`);
        console.log(`   Total Members: ~${expectedCount.toLocaleString()}`);
        console.log('');

        // For very large servers, skip full fetch - it will timeout
        const LARGE_SERVER_THRESHOLD = 50000;

        if (expectedCount > LARGE_SERVER_THRESHOLD) {
            console.log(`   ⚡ Large server detected (${expectedCount.toLocaleString()} members)`);
            console.log(`   📋 Using on-demand fetching (faster & more reliable)`);
            console.log(`   ℹ️  Members will be fetched when processing messages\n`);

            // Just use whatever is in cache
            const cachedMembers = guild.members.cache;
            console.log(`   Cache has ${cachedMembers.size.toLocaleString()} members pre-loaded`);

            // Store cached members
            cachedMembers.forEach(member => {
                const roles = member.roles.cache
                    .filter(role => role.name !== '@everyone')
                    .map(role => ({
                        id: role.id,
                        name: role.name,
                        color: role.hexColor
                    }));

                const memberData = {
                    id: member.user.id,
                    username: member.user.username,
                    displayName: member.displayName,
                    discriminator: member.user.discriminator,
                    avatar: member.user.avatarURL({ dynamic: true, size: 512 }),
                    accentColor: member.user.accentColor || null,
                    roles: roles,
                    roleNames: roles.map(r => r.name),
                    joinedAt: member.joinedAt,
                    createdAt: member.user.createdAt,
                    isBot: member.user.bot,
                    customStatus: null,
                    connectedAccounts: []
                };
                this.members.set(member.user.id, memberData);
            });

            return Array.from(this.members.values());
        }

        // For smaller servers, do normal fetch
        progress.reset();
        let animationInterval;
        let dotCount = 0;

        animationInterval = setInterval(() => {
            const spinner = progress.getSpinner();
            const elapsed = progress.formatTime(Date.now() - progress.startTime);
            const dots = '.'.repeat((dotCount % 3) + 1).padEnd(3);
            dotCount++;
            progress.update(`   ${spinner} Fetching members${dots} (${elapsed})`);
        }, 150);

        try {
            const members = await guild.members.fetch({ force: true });

            clearInterval(animationInterval);
            const elapsed = progress.formatTime(Date.now() - progress.startTime);
            progress.finish(`   ✅ Fetched ${members.size.toLocaleString()} members | Time: ${elapsed}`);

            const memberList = [];

            members.forEach(member => {
                const roles = member.roles.cache
                    .filter(role => role.name !== '@everyone')
                    .map(role => ({
                        id: role.id,
                        name: role.name,
                        color: role.hexColor
                    }));

                // Get custom status from presence activities
                let customStatus = null;
                if (member.presence && member.presence.activities) {
                    const customActivity = member.presence.activities.find(
                        a => a.type === 4 || a.type === 'CUSTOM'
                    );
                    if (customActivity) {
                        customStatus = customActivity.state || customActivity.name;
                    }
                }

                // Get connected accounts (if available through profile)
                // Note: Connected accounts require fetching user profile which may not always be available
                let connectedAccounts = [];

                const memberData = {
                    id: member.user.id,
                    username: member.user.username,
                    displayName: member.displayName,
                    discriminator: member.user.discriminator,
                    avatar: member.user.avatarURL({ dynamic: true, size: 512 }),
                    accentColor: member.user.accentColor || null,
                    roles: roles,
                    roleNames: roles.map(r => r.name),
                    joinedAt: member.joinedAt,
                    createdAt: member.user.createdAt,  // Account creation date
                    isBot: member.user.bot,
                    customStatus: customStatus,
                    connectedAccounts: connectedAccounts
                };

                memberList.push(memberData);
                this.members.set(member.user.id, memberData);
            });

            // Filter out bots
            const humanMembers = memberList.filter(m => !m.isBot);
            console.log(`   Human members: ${humanMembers.length.toLocaleString()}`);

            return memberList;
        } catch (error) {
            clearInterval(animationInterval);
            console.error('❌ Error fetching members:', error.message);
            throw error;
        }
    }

    /**
     * Get all text channels from the server
     */
    async getAllTextChannels() {
        const guild = await this.client.guilds.fetch(this.serverId);
        if (!guild) {
            throw new Error(`Server ID ${this.serverId} not found`);
        }

        const channels = await guild.channels.fetch();

        // Filter only text-based channels that we can read messages from
        const textChannels = channels
            .filter(channel => {
                // Text channels, announcement channels
                const validTypes = [0, 'GUILD_TEXT', 5, 'GUILD_ANNOUNCEMENT'];
                return validTypes.includes(channel.type);
            })
            .map(channel => ({
                id: channel.id,
                name: channel.name,
                type: channel.type,
                parentId: channel.parentId,
                parentName: channel.parent ? channel.parent.name : null
            }));

        return Array.from(textChannels.values());
    }

    /**
     * Analyze messages in specified channels and count activity per member
     * @param {Object} channelCategories - { "tweet": ["id1", "id2"], "art": ["id3"] }
     * @param {number} messageLimit - Max messages to fetch per channel
     */
    async analyzeActivity(channelCategories, messageLimit = 10000) {
        console.log('\n📊 Starting activity analysis...');

        // Initialize activity tracker for all members
        this.members.forEach((member, id) => {
            this.memberActivity.set(id, {
                userId: id,
                username: member.username,
                displayName: member.displayName,
                discriminator: member.discriminator,
                avatar: member.avatar,
                accentColor: member.accentColor,
                roles: member.roleNames,
                isBot: member.isBot,
                joinedAt: member.joinedAt,
                createdAt: member.createdAt,
                customStatus: member.customStatus,
                connectedAccounts: member.connectedAccounts,
                activity: {},
                totalMessages: 0,
                xUsername: null,
                firstMessageDate: null,
                lastMessageDate: null
            });
        });

        // Reset channel stats
        this.channelStats = [];
        this.refetchCacheHits = 0;

        // Process each category
        for (const [category, channelIds] of Object.entries(channelCategories)) {
            console.log(`\n📁 Processing category: ${category}`);

            for (const channelId of channelIds) {
                await this.processChannel(channelId, category, messageLimit);
            }
        }

        // Try to refetch members who weren't found initially
        console.log('\n🔄 Checking for unfetched members...');
        await this.refetchMissingMembers();

        // Convert to array and sort by total messages
        const activityArray = Array.from(this.memberActivity.values())
            .filter(a => a.totalMessages > 0)
            .sort((a, b) => b.totalMessages - a.totalMessages);

        return activityArray;
    }

    /**
     * Try to refetch member data for users marked as [Not Fetched]
     */
    async refetchMissingMembers() {
        const guild = await this.client.guilds.fetch(this.serverId);

        // First, count how many need refetching
        let usersToRefetch = [];
        for (const [userId, activity] of this.memberActivity) {
            if (activity.roles && activity.roles.includes('[Not Fetched]') && !activity.isBot) {
                usersToRefetch.push({ userId, activity });
            }
        }

        let cacheHitCount = 0;
        if (this.refetchCache.size > 0) {
            const unresolvedUsers = [];
            for (const item of usersToRefetch) {
                const cachedEntry = this.refetchCache.get(item.userId);
                if (this.applyRefetchCacheEntry(item.activity, item.userId, cachedEntry)) {
                    cacheHitCount++;
                } else {
                    unresolvedUsers.push(item);
                }
            }
            usersToRefetch = unresolvedUsers;
            this.refetchCacheHits += cacheHitCount;
        }

        if (usersToRefetch.length === 0) {
            if (cacheHitCount > 0) {
                console.log(`  Refetch cache resolved ${cacheHitCount.toLocaleString()} users before API calls.`);
            }
            console.log('  ✅ All members already fetched!');
            return;
        }

        console.log(`  Found ${usersToRefetch.length} users to refetch...`);
        if (cacheHitCount > 0) {
            console.log(`  Refetch cache resolved ${cacheHitCount.toLocaleString()} users before API calls.`);
        }
        progress.reset();

        let successCount = 0;
        let failCount = 0;
        let cacheWriteCount = 0;

        for (let i = 0; i < usersToRefetch.length; i++) {
            const { userId, activity } = usersToRefetch[i];

            // Animated progress
            const spinner = progress.getSpinner();
            const current = i + 1;
            const pct = Math.round((current / usersToRefetch.length) * 100);
            progress.update(`  ${spinner} Refetching: ${current}/${usersToRefetch.length} (${pct}%) | ✓ ${successCount} | ✗ ${failCount}`);

            try {
                // Try to fetch individual member
                const member = await guild.members.fetch(userId);

                if (member) {
                    // Get their roles
                    const roles = member.roles.cache
                        .filter(role => role.name !== '@everyone')
                        .map(role => role.name);

                    const cacheEntry = this.createMemberCacheEntry(userId, member, roles);
                    this.refetchCache.set(userId, cacheEntry);
                    this.refetchCacheDirty = true;
                    cacheWriteCount++;
                    this.applyRefetchCacheEntry(activity, userId, cacheEntry);

                    successCount++;
                }
            } catch (err) {
                const cacheEntry = this.createLeftServerCacheEntry(userId, activity, err);
                this.refetchCache.set(userId, cacheEntry);
                this.refetchCacheDirty = true;
                cacheWriteCount++;
                this.applyRefetchCacheEntry(activity, userId, cacheEntry);
                failCount++;
            }

            if (this.refetchCacheDirty && cacheWriteCount % 100 === 0) {
                this.saveRefetchCache({ silent: true });
            }

            // Jeda kecil untuk rate limiting
            const randomDelay = Math.floor(Math.random() * 50) + 25;
            await new Promise(r => setTimeout(r, randomDelay));
        }

        if (this.refetchCacheDirty) {
            this.saveRefetchCache();
        }

        const elapsed = progress.formatTime(Date.now() - progress.startTime);
        progress.finish(`  ✅ Refetch complete: ${successCount} found, ${failCount} left server | Time: ${elapsed}`);
    }

    /**
     * Process a single channel and count messages per user
     * Now includes ALL messages (including bots)
     */
    async processChannel(channelId, category, limit) {
        try {
            const channel = await this.client.channels.fetch(channelId);

            if (!channel) {
                console.warn(`Channel ${channelId} not found`);
                return;
            }

            // Channel header
            console.log(`\n  📨 #${channel.name}`);

            let messages = [];
            let lastId; // For pagination (fetching older messages)
            let fetchedCount = 0;
            let hitLimit = false;
            let noMoreMessages = false;

            // INCREMENTAL SCAN LOGIC
            // Get the last message ID we processed for this channel
            const lastCheckpointId = this.checkpoints[channelId];
            let newCheckpointId = null; // To store the newest message ID found in this run
            let reachedCheckpoint = false;

            if (lastCheckpointId) {
                console.log(`   📍 Resuming from checkpoint: ${lastCheckpointId} (Incremental Scan)`);
            } else {
                console.log(`   🆕 No checkpoint found. Performing FULL scan.`);
            }

            // Reset progress timer
            progress.reset();

            // Fetch messages with pagination
            do {
                const options = { limit: 100 };
                if (lastId) options.before = lastId;

                const fetchedMessages = await channel.messages.fetch(options);

                if (fetchedMessages.size === 0) {
                    noMoreMessages = true;
                    break;
                }

                // Include ALL messages (bots included)
                // Include ALL messages (bots included)
                for (const msg of fetchedMessages.values()) {
                    // Capture the very first (newest) message ID to save as next checkpoint
                    if (!newCheckpointId) {
                        newCheckpointId = msg.id;
                    }

                    // CHECKPOINT STOP CONDITION
                    if (lastCheckpointId && BigInt(msg.id) <= BigInt(lastCheckpointId)) {
                        reachedCheckpoint = true;
                        break;
                    }

                    messages.push({
                        authorId: msg.author.id,
                        authorUsername: msg.author.username,
                        isBot: msg.author.bot,
                        content: msg.content,
                        hasAttachment: msg.attachments.size > 0,
                        attachmentCount: msg.attachments.size,
                        createdAt: msg.createdAt
                    });
                }

                fetchedCount += fetchedMessages.size;

                // Stop fetching if we reached old messages
                if (reachedCheckpoint) {
                    noMoreMessages = true;
                    // Dont break here, we need to update progress one last time
                    // But set lastId to null to break loop
                    lastId = null;
                } else {
                    lastId = fetchedMessages.last()?.id;
                }

                // Animated progress display
                const spinner = progress.getSpinner();
                const count = progress.formatNumber(messages.length);
                const speed = progress.getSpeed(messages.length);
                const elapsed = progress.formatTime(Date.now() - progress.startTime);
                const limitStr = limit === Infinity ? '∞' : progress.formatNumber(limit);

                progress.update(`     ${spinner} Fetching: ${count} messages | Speed: ${speed} | Time: ${elapsed} | Limit: ${limitStr}`);

                if (messages.length >= limit) {
                    messages = messages.slice(0, limit);
                    hitLimit = true;
                    break;
                }

                // Jeda acak untuk fetching pesan (sekitar 50 pesan/detik: 1500ms - 2500ms)
                const randomDelay = Math.floor(Math.random() * 1000) + 1500;
                await new Promise(r => setTimeout(r, randomDelay));

                if (reachedCheckpoint || noMoreMessages) break;

            } while (true);


            // Track channel stats
            const channelStat = {
                channelId,
                channelName: channel.name,
                category,
                messageCount: messages.length,
                limit,
                hitLimit,
                complete: noMoreMessages || hitLimit
            };
            this.channelStats.push(channelStat);

            // Final status with nice formatting
            const totalFormatted = progress.formatNumber(messages.length);
            const elapsed = progress.formatTime(Date.now() - progress.startTime);
            const limitStatus = hitLimit ? '⚠️  HIT LIMIT' : '✅ Complete';
            progress.finish(`     ✓ Done: ${totalFormatted} messages | Time: ${elapsed} | ${limitStatus}`);

            // =============================================
            // CHECKPOINT DATA: Load existing + merge + save
            // =============================================
            const existingChannelData = this.loadChannelCheckpointData(channelId);
            const mergedMessages = this.saveChannelCheckpointData(channelId, messages, existingChannelData);

            // Use ALL merged data for activity counting (not just new messages)
            // This ensures we count every message ever sent, zero data loss
            messages = mergedMessages;

            // Save the NEW checkpoint ID (if we found any new messages)
            if (newCheckpointId) {
                this.checkpoints[channelId] = newCheckpointId;
                this.saveCheckpoints();
                console.log(`   📍 Checkpoint updated to: ${newCheckpointId}`);
            }

            // Count messages per user for this category
            for (const msg of messages) {
                let activity = this.memberActivity.get(msg.authorId);

                // If user not in activity map, check if they're in members map
                if (!activity) {
                    // Check if user exists in members cache
                    let memberData = this.members.get(msg.authorId);
                    let cachedEntry = null;

                    // Determine roles based on available data
                    let userRoles;
                    if (memberData) {
                        userRoles = memberData.roleNames;
                    } else if (msg.isBot) {
                        userRoles = ['[Bot]'];
                    } else {
                        // User not in our member cache - they may have left or weren't fetched
                        cachedEntry = this.refetchCache.get(msg.authorId);
                        if (cachedEntry?.status === 'found') {
                            memberData = this.memberDataFromCacheEntry(msg.authorId, cachedEntry);
                            this.members.set(msg.authorId, memberData);
                            userRoles = memberData.roleNames;
                            this.refetchCacheHits++;
                        } else if (cachedEntry?.status === 'left') {
                            userRoles = ['[Left Server]'];
                            this.refetchCacheHits++;
                        } else {
                            userRoles = ['[Not Fetched]'];
                        }
                    }

                    activity = {
                        userId: msg.authorId,
                        username: memberData?.username || cachedEntry?.username || msg.authorUsername,
                        displayName: memberData?.displayName || cachedEntry?.displayName || msg.authorUsername,
                        discriminator: memberData?.discriminator || cachedEntry?.discriminator || '0',
                        avatar: memberData?.avatar || cachedEntry?.avatar || null,
                        accentColor: memberData?.accentColor || cachedEntry?.accentColor || null,
                        roles: userRoles,
                        isBot: memberData?.isBot || msg.isBot,
                        joinedAt: memberData?.joinedAt || cachedEntry?.joinedAt || null,
                        createdAt: memberData?.createdAt || cachedEntry?.createdAt || null,
                        customStatus: memberData?.customStatus || null,
                        connectedAccounts: memberData?.connectedAccounts || [],
                        activity: {},
                        totalMessages: 0,
                        xUsername: null,
                        firstMessageDate: null,
                        lastMessageDate: null
                    };
                    this.memberActivity.set(msg.authorId, activity);
                }

                // Initialize category if not exists
                if (!activity.activity[category]) {
                    activity.activity[category] = 0;
                }

                activity.activity[category]++;
                activity.totalMessages++;

                // Track date range
                const msgDate = new Date(msg.createdAt);
                if (!activity.firstMessageDate || msgDate < activity.firstMessageDate) {
                    activity.firstMessageDate = msgDate;
                }
                if (!activity.lastMessageDate || msgDate > activity.lastMessageDate) {
                    activity.lastMessageDate = msgDate;
                }

                // Extract X/Twitter Username if in tweet category
                if (category === 'tweet' && !activity.xUsername && msg.content) {
                    // Match pattern: https://x.com/username/status/... or https://twitter.com/username/status/...
                    const xMatch = msg.content.match(/https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([^\/]+)\/status\/\d+/i);
                    if (xMatch && xMatch[1]) {
                        activity.xUsername = xMatch[1];
                        // console.log(`    Found X username for ${activity.displayName}: ${activity.xUsername}`);
                    }
                }
            }

        } catch (error) {
            console.error(`  Error processing channel ${channelId}:`, error.message);
        }
    }

    /**
     * Get channel statistics
     */
    getChannelStats() {
        return this.channelStats;
    }

    /**
     * Generate leaderboard for a specific category
     */
    generateLeaderboard(category, limit = 50) {
        const sorted = Array.from(this.memberActivity.values())
            .filter(a => a.activity[category] && a.activity[category] > 0)
            .sort((a, b) => (b.activity[category] || 0) - (a.activity[category] || 0))
            .slice(0, limit);

        return sorted.map((member, index) => ({
            rank: index + 1,
            userId: member.userId,
            username: member.username,
            displayName: member.displayName,
            roles: member.roles,
            count: member.activity[category] || 0
        }));
    }

    /**
     * Save all analytics data to files
     */
    async saveResults(activityData) {
        const analyticsDir = path.join(this.outputDir, 'analytics');
        await utils.ensureDir(analyticsDir);

        // 1. Save full member list with roles
        const memberList = Array.from(this.members.values());
        await utils.saveJsonFile(memberList, path.join(analyticsDir, 'members.json'));
        console.log(`\n✅ Saved ${memberList.length} members to members.json`);

        // 2. Save full activity data
        await utils.saveJsonFile(activityData, path.join(analyticsDir, 'member_activity.json'));
        console.log(`✅ Saved activity data for ${activityData.length} active members`);

        // 3. Generate and save leaderboards for each category
        const categories = new Set();
        activityData.forEach(a => {
            Object.keys(a.activity).forEach(cat => categories.add(cat));
        });

        const leaderboards = {};
        for (const category of categories) {
            leaderboards[category] = this.generateLeaderboard(category, 100);
        }
        await utils.saveJsonFile(leaderboards, path.join(analyticsDir, 'leaderboards.json'));
        console.log(`✅ Saved leaderboards for categories: ${Array.from(categories).join(', ')}`);

        // 4. Generate readable text summary
        let textSummary = `Discord Server Member Activity Report\n`;
        textSummary += `Generated: ${new Date().toLocaleString()}\n`;
        textSummary += `${'='.repeat(60)}\n\n`;

        // Overall stats
        textSummary += `📊 OVERALL STATISTICS\n`;
        textSummary += `-`.repeat(40) + '\n';
        textSummary += `Total Members: ${memberList.length}\n`;
        textSummary += `Active Members: ${activityData.length}\n`;
        textSummary += `Categories Tracked: ${Array.from(categories).join(', ')}\n\n`;

        // Leaderboards
        for (const category of categories) {
            const lb = leaderboards[category];
            textSummary += `\n🏆 LEADERBOARD: ${category.toUpperCase()}\n`;
            textSummary += `-`.repeat(40) + '\n';

            lb.slice(0, 20).forEach(entry => {
                textSummary += `${entry.rank.toString().padStart(3)}. ${entry.displayName.padEnd(25)} - ${entry.count}\n`;
            });
        }

        // Top contributors summary
        textSummary += `\n\n📋 TOP 50 CONTRIBUTORS (All Categories)\n`;
        textSummary += `${'='.repeat(60)}\n\n`;

        activityData.slice(0, 50).forEach((member, index) => {
            textSummary += `${(index + 1).toString().padStart(3)}. ${member.displayName} (@${member.username})\n`;
            textSummary += `    Roles: ${member.roles.slice(0, 5).join(', ')}\n`;
            textSummary += `    Total Messages: ${member.totalMessages}\n`;

            for (const [cat, count] of Object.entries(member.activity)) {
                textSummary += `    - ${cat}: ${count}\n`;
            }
            textSummary += '\n';
        });

        await utils.saveTextFile(textSummary, path.join(analyticsDir, 'activity_report.txt'));
        console.log(`✅ Saved readable report to activity_report.txt`);

        // 5. Generate CSV for spreadsheet import
        let csv = 'Rank,User ID,Username,Display Name,Roles,Total Messages,X Username';
        const catArray = Array.from(categories);
        catArray.forEach(cat => {
            csv += `,${cat}`;
        });
        csv += ',First Message,Last Message\n';

        activityData.forEach((member, index) => {
            csv += `${index + 1},`;
            csv += `"${member.userId}",`;
            csv += `"${member.username}",`;
            csv += `"${member.displayName}",`;
            csv += `"${member.roles.join('; ')}",`;
            csv += `${member.totalMessages},`;
            csv += `"${member.xUsername || ''}"`;

            catArray.forEach(cat => {
                csv += `,${member.activity[cat] || 0}`;
            });

            csv += `,${member.firstMessageDate ? member.firstMessageDate.toISOString().split('T')[0] : ''},`;
            csv += `${member.lastMessageDate ? member.lastMessageDate.toISOString().split('T')[0] : ''}\n`;
        });

        await utils.saveTextFile(csv, path.join(analyticsDir, 'activity_data.csv'));
        console.log(`✅ Saved CSV data to activity_data.csv`);

        console.log(`\n📁 All results saved to: ${analyticsDir}`);
    }

    async close() {
        await this.client.destroy();
        console.log('Discord client closed');
    }
}

module.exports = MemberAnalytics;
