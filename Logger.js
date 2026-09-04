const fs = require('fs');
const path = require('path');
const {v7: uuidv7} = require('uuid');
const express = require('express');

/**
 * @class Logger
 * @description Logs requests and responses to a file
 */
class Logger {
    /**
     * @constructor
     * @param {GeminiConfig} config
     */
    constructor(config) {
        this.config = config;
        this.locate = this.config.LOG_DIR;
        this.init();
    }

    init() {
        this.startTime = new Date();
        this.entries = [];
    }

    /**
     * @function log
     * @description Logs a message to the console and the log file
     * @param {string} endpoint - The endpoint of the request
     * @param {string} message - The message to log
     * @param {any} [data] - Additional data to log
     */
    log(endpoint, message, data = null) {
        const timestamp = new Date().toISOString();
        const duration = Date.now() - this.startTime.getTime();
        const entry = {
            timestamp,
            endpoint,
            level: 'INFO',
            message,
            duration: `${duration}ms`,
            data: data ? this.formatData(data) : null
        };
        this.entries.push(entry);
        console.log(`${message}${data ? `: ${this.formatData(data, true)}` : ''}`);
    }

    /**
     * @function error
     * @description Logs an error to the console and the log file
     * @param {string} endpoint - The endpoint of the request
     * @param {string} message - The error message to log
     * @param {Error|express.Error} error - The error object to log
     */
    error(endpoint, message, error) {
        const timestamp = new Date().toISOString();
        const duration = Date.now() - this.startTime.getTime();
        const entry = {
            timestamp,
            endpoint,
            level: 'ERROR',
            message,
            duration: `${duration}ms`,
            error: error instanceof Error ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
                code: error.code
            } : error
        };
        this.entries.push(entry);
        console.error(`[ERROR: ${message}`, error);
    }

    /**
     * @function warn
     * @description Logs a warning to the console and the log file
     * @param {string} message - The info message to log
     * @param {string} endpoint - The endpoint of the request
     * @param {any} [data] - Additional data to log
     */
    warn(endpoint, message, data) {
        const timestamp = new Date().toISOString();
        const duration = Date.now() - this.startTime.getTime();
        const entry = {
            timestamp,
            endpoint,
            level: 'WARN',
            duration: `${duration}ms`,
            message,
            data: data ? this.formatData(data) : null
        };
        this.entries.push(entry);
        console.warn(`[WARN: ${message}${data ? `: ${this.formatData(data, true)}` : ''}`);
    }

    /**
     * @function formatData
     * @description Formats data to a string for logging
     * @param {any} data - The data to format
     * @param {boolean} [forConsole=false] - Whether to format the data for console output
     * @returns {string|null} The formatted data
     */
    formatData(data, forConsole = false) {
        if (!data) {
            return null;
        }
        if (forConsole) {
            if (typeof data === 'string' && data.length > 100) {
                return `${data.substring(0, 100)}...`;
            }
            if (typeof data === 'object') {
                return `[Object with ${Object.keys(data).length} properties]`;
            }
        }
        if (typeof data === 'string') {
            return data;
        }
        if (typeof data === 'object') {
            try {
                return JSON.stringify(data, null, 2);
            } catch (e) {
                return String(data);
            }
        }
        return String(data);
    }

    /**
     * @function save
     * @description Saves the log file to disk
     * @returns {Promise<void>}
     */
    async save() {
        const requestId = uuidv7();
        try {
            await fs.promises.mkdir(this.locate, {recursive: true});
            const duration = Date.now() - this.startTime.getTime();
            const logContent = {
                requestId: requestId,
                startTime: this.startTime.toString(),
                duration: `${duration}ms`,
                entries: this.entries
            };
            const fileName = `${requestId}.json`;
            const filePath = path.join(this.locate, fileName);
            await fs.promises.writeFile(filePath, JSON.stringify(logContent, null, 2), 'utf8');
            this.init();
        } catch (e) {
            console.error(`Failed to save log file for ${requestId}:`, e.message);
        }
    }
}

module.exports = Logger;