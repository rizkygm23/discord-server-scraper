const fs = require('fs-extra');
const path = require('path');
const { Client } = require('discord.js-selfbot-v13');
const config = require('./config');
const utils = require('./utils');
const { getDiscordToken } = require('./auth');

/**
 * Discord Member Analytics
 * Tracks member activity across different channel categories
 */
class MemberAnalytics {
    constructor(channelConfig = {}) {
        this.client = new Client({
            checkUpdate: false,
        });
        this.outputDir = config.outputDir;
        this.initialized = false;

        // Channel configuration for tracking
        // Example: { "tweet": ["channel_id_1"], "art": ["channel_id_2"] }
        this.channelConfig = channelConfig;

        // Store all member data
        this.members = new Map();

        // Store activity data per member
        this.memberActivity = new Map();
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

        if (!config.serverId) {
            throw new Error('Server ID not provided. Check your .env file.');
        }

        await utils.ensureDir(this.outputDir);

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
     * Get all members from the server with their roles
     */
    async getAllMembers() {
        console.log('Fetching all server members...');

        const guild = await this.client.guilds.fetch(config.serverId);
        if (!guild) {
            throw new Error(`Server ID ${config.serverId} not found`);
        }

        // Fetch all members (this may take a while for large servers)
        console.log(`Server: ${guild.name} (${guild.memberCount} members)`);
        console.log('This may take a while for large servers...');

        const members = await guild.members.fetch();

        const memberList = [];

        members.forEach(member => {
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
                avatar: member.user.avatarURL({ dynamic: true }),
                roles: roles,
                roleNames: roles.map(r => r.name),
                joinedAt: member.joinedAt,
                isBot: member.user.bot
            };

            memberList.push(memberData);
            this.members.set(member.user.id, memberData);
        });

        console.log(`Fetched ${memberList.length} members`);

        // Filter out bots
        const humanMembers = memberList.filter(m => !m.isBot);
        console.log(`Human members: ${humanMembers.length}`);

        return memberList;
    }

    /**
     * Get all text channels from the server
     */
    async getAllTextChannels() {
        const guild = await this.client.guilds.fetch(config.serverId);
        if (!guild) {
            throw new Error(`Server ID ${config.serverId} not found`);
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
                roles: member.roleNames,
                activity: {},
                totalMessages: 0,
                firstMessageDate: null,
                lastMessageDate: null
            });
        });

        // Process each category
        for (const [category, channelIds] of Object.entries(channelCategories)) {
            console.log(`\n📁 Processing category: ${category}`);

            for (const channelId of channelIds) {
                await this.processChannel(channelId, category, messageLimit);
            }
        }

        // Convert to array and sort by total messages
        const activityArray = Array.from(this.memberActivity.values())
            .filter(a => a.totalMessages > 0)
            .sort((a, b) => b.totalMessages - a.totalMessages);

        return activityArray;
    }

    /**
     * Process a single channel and count messages per user
     */
    async processChannel(channelId, category, limit) {
        try {
            const channel = await this.client.channels.fetch(channelId);

            if (!channel) {
                console.warn(`Channel ${channelId} not found`);
                return;
            }

            console.log(`  Channel: #${channel.name} (${channelId})`);

            let messages = [];
            let lastId;
            let fetchedCount = 0;

            // Fetch messages with pagination
            do {
                const options = { limit: 100 };
                if (lastId) options.before = lastId;

                const fetchedMessages = await channel.messages.fetch(options);

                if (fetchedMessages.size === 0) break;

                fetchedMessages.forEach(msg => {
                    if (!msg.author.bot) {
                        messages.push({
                            authorId: msg.author.id,
                            authorUsername: msg.author.username,
                            content: msg.content,
                            hasAttachment: msg.attachments.size > 0,
                            attachmentCount: msg.attachments.size,
                            createdAt: msg.createdAt
                        });
                    }
                });

                lastId = fetchedMessages.last()?.id;
                fetchedCount += fetchedMessages.size;

                // Progress indicator
                if (fetchedCount % 500 === 0) {
                    console.log(`    Fetched ${fetchedCount} messages...`);
                }

                if (messages.length >= limit) {
                    messages = messages.slice(0, limit);
                    break;
                }

                // Small delay to avoid rate limiting
                await new Promise(r => setTimeout(r, 100));

            } while (true);

            console.log(`    Total: ${messages.length} messages (excluding bots)`);

            // Count messages per user for this category
            for (const msg of messages) {
                let activity = this.memberActivity.get(msg.authorId);

                // If user left the server, create entry for them
                if (!activity) {
                    activity = {
                        userId: msg.authorId,
                        username: msg.authorUsername,
                        displayName: msg.authorUsername,
                        roles: ['[Left Server]'],
                        activity: {},
                        totalMessages: 0,
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
            }

        } catch (error) {
            console.error(`  Error processing channel ${channelId}:`, error.message);
        }
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
        let csv = 'Rank,User ID,Username,Display Name,Roles,Total Messages';
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
            csv += `${member.totalMessages}`;

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
