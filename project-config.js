const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

const CONFIG_FILE = path.join(__dirname, 'projects.config.json');
const TABLE_NAME_REGEX = /^[a-z][a-z0-9_]*_dc_user$/;
const PROJECT_KEY_REGEX = /^[a-z][a-z0-9_]*$/;

function resolveEnvValue(value) {
    if (typeof value !== 'string') return value;

    return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => process.env[name] || '');
}

function normalizeMessageLimit(value) {
    if (value === undefined || value === null || value === 'Infinity') return Infinity;

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return Infinity;
    }

    return parsed;
}

function normalizeProject(rawProject) {
    const project = {
        ...rawProject,
        serverId: resolveEnvValue(rawProject.serverId),
        outputDir: resolveEnvValue(rawProject.outputDir),
        stateDir: resolveEnvValue(rawProject.stateDir),
        tableName: resolveEnvValue(rawProject.tableName),
        messageLimit: normalizeMessageLimit(resolveEnvValue(rawProject.messageLimit)),
        channels: rawProject.channels || {},
        features: {
            magnitudePromotion: false,
            regionRole: false,
            sanitizePromotions: false,
            ...(rawProject.features || {})
        },
        schedule: {
            timezone: 'Asia/Jakarta',
            defaultHour: 7,
            fridayHour: 17,
            ...(rawProject.schedule || {})
        }
    };

    if (!project.key || !PROJECT_KEY_REGEX.test(project.key)) {
        throw new Error(`Invalid project key "${project.key}". Use lowercase letters, numbers, and underscores.`);
    }

    if (!project.tableName) {
        project.tableName = `${project.key}_dc_user`;
    }

    if (!TABLE_NAME_REGEX.test(project.tableName)) {
        throw new Error(`Invalid tableName "${project.tableName}" for project "${project.key}". Expected format: nama_project_dc_user`);
    }

    if (!project.serverId) {
        throw new Error(`Missing serverId for project "${project.key}".`);
    }

    if (!project.outputDir) {
        project.outputDir = path.join('data', project.key, 'output');
    }

    if (!project.stateDir) {
        project.stateDir = path.join('data', project.key, 'state');
    }

    if (!project.name) {
        project.name = project.key;
    }

    return project;
}

function loadProjectConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        throw new Error(`Project config not found: ${CONFIG_FILE}`);
    }

    const raw = fs.readJsonSync(CONFIG_FILE);
    const projects = (raw.projects || []).map(normalizeProject);

    if (projects.length === 0) {
        throw new Error('projects.config.json must contain at least one project.');
    }

    return {
        defaultProject: raw.defaultProject || projects[0].key,
        projects
    };
}

function getProject(projectKey) {
    const config = loadProjectConfig();
    const key = projectKey || config.defaultProject;
    const project = config.projects.find(p => p.key === key);

    if (!project) {
        const available = config.projects.map(p => p.key).join(', ');
        throw new Error(`Unknown project "${key}". Available projects: ${available}`);
    }

    return project;
}

module.exports = {
    loadProjectConfig,
    getProject,
    TABLE_NAME_REGEX
};
