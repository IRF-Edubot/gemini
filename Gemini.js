const Logger = require('./Logger');
const express = require('express');
const instructions = require('./Instructions');
const {GoogleGenAI} = require('@google/genai');
const Authentication = require('./Authentication');
const ClassyClient = require('./ClassyClient');
const GeminiConfig = require('./GeminiConfig');
const {execSync} = require('child_process');
const path = require('path');
const fs = require('fs');
const Redis = require('ioredis');
const url = require('node:url');

/**
 * @typedef {import('express').Request} Request
 */
class Gemini {
    /**
     * @async
     * @returns {Promise<void>}
     */
    constructor() {
        this.userID = null;
        this.config = new GeminiConfig();
        this.url = '';
        this.sessionToken = '';
        this.geminiTokenUsageKey = null;
        this.redis = new Redis({
            host: '172.18.0.2',
            port: 6379,
            password: 'D9W?D2r0a0g8on'
        });
        this.logger = new Logger(this.config);
        this.ai = new GoogleGenAI({apiKey: this.config.API_KEY});
        this.app = express();
        this.app.use(express.json({limit: '512mb'}));
        this.server = this.app.listen(this.config.PORT, () => {
            this.logger.log('Gemini/constructor', `Server running on port ${this.config.PORT}`);
            this.logger.log('Gemini/constructor', `Logs directory: ${this.config.LOG_DIR}`);
        });
        this.server.requestTimeout = 600000;
        this.server.headersTimeout = 615000;
        this.server.keepAliveTimeout = 610000;
        this.createRoutes().then(() => {
            this.logger.log('Gemini/constructor', 'Routes created');
        });
    }

    /**
     * @param {express.Request} request
     * @returns {{CLASSY_SESSION: string}}
     */
    parseCookies(request) {
        this.logger.log('Gemini/parseCookies', `Request headers: ${JSON.stringify(request.headers)}`);
        const list = {
            CLASSY_SESSION: ''
        };
        const cookieHeader = request.headers?.cookie;
        if (cookieHeader) {
            cookieHeader.split(`;`).forEach(cookie => {
                let [name, ...rest] = cookie.split(`=`);
                name = name?.trim();
                if (!name) {
                    return;
                }
                const value = rest.join(`=`).trim();
                if (!value) {
                    return;
                }
                list[name] = decodeURIComponent(value);
            });
        }
        this.logger.log('Gemini/parseCookies', `Headers: ${JSON.stringify(request.headers)}`);
        this.logger.log('Gemini/parseCookies', `Cookies: ${JSON.stringify(list)}`);
        return list;
    }

    /**
     * @param message
     * @returns {{error: *, timestamp: string}}
     */
    createErrorResponse(message) {
        return {
            error: message,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * @async
     * @returns {Promise<void>}
     */
    async createRoutes() {
        this.logger.log('Gemini/createRoutes', 'Creating routes');
        this.app.get('/gemini/health', this.authHandler.bind(this), this.healthHandler.bind(this));
        this.app.post('/gemini/stream', this.authHandler.bind(this), this.streamInteractionHandler.bind(this));
        this.app.post('/gemini/generateImage', this.authHandler.bind(this), this.generateImageHandler.bind(this));
        this.app.use(this.errorHandler.bind(this));
    }

    /**
     * @param {express.Request} request
     * @param {express.Response} response
     */
    healthHandler(request, response) {
        this.logger.log('Gemini/healthHandler', `Health request`);
        const ip = request.ip || request.connection.remoteAddress;
        const authentication = new Authentication(this.config, this.sessionToken, ip, this.logger);
        response.json({
            status: 'OK',
            url: this.url,
            clientIP: request.headers['x-forwarded-for'] || request.socket.remoteAddress,
            ipAddress: ip,
            server: this.getConnectFrom(),
            model: this.config.MODEL_NAME,
            timestamp: new Date().toISOString(),
            allowed: authentication.validateRequestIP()
        });
        this.logger.log('Gemini/healthHandler', `Health complete`);
    }

    /**
     * @param {express.Request} request
     * @param {express.Response} response
     * @param {Function} next
     */
    async authHandler(request, response, next) {
        this.logger.log('Gemini/authHandler', `Authenticating request`);
        const cookies = this.parseCookies(request);
        this.sessionToken = cookies.CLASSY_SESSION;
        const ip = request.ip || request.connection.remoteAddress;
        const authentication = new Authentication(this.config, this.sessionToken, ip, this.logger);
        const authenticationResult = authentication.authenticate();
        if (authenticationResult.success) {
            this.userID = authenticationResult.userID;
            this.url = authenticationResult.iss + '/Wheatley/Core.php';
            if (this.geminiTokenUsageKey === null) {
                this.geminiTokenUsageKey = `${this.getConnectFrom()}/GEMINI_TOKEN_USAGE`;
            }
            next();
        }
    }

    /**
     * @returns {string}
     */
    getConnectFrom() {
        const host = new URL(this.url).host;
        const urlExplode = host.split('.');
        const appName = urlExplode[0];
        let connectFrom = 'unknown';
        if (urlExplode[1] === 'classyedu') {
            connectFrom = 'production';
        } else if (urlExplode[1] === 'test') {
            connectFrom = 'test';
        }
        return `${appName}.${connectFrom}`.toUpperCase();
    }

    /**
     * @param {express.Error} error
     * @param {express.Request} request
     * @param {express.Response} response
     * @param {Function} next
     */
    errorHandler(error, request, response, next) {
        this.logger.error('Gemini/errorHandler', 'Internal server error:', error);
        response.status(500).json(this.createErrorResponse('Internal server error'));
    }

    /**
     * @param {string} path
     * @param {string} mimeType
     * @returns {Promise<Object>}
     */
    async uploadFile(path, mimeType) {
        this.logger.log('Gemini/uploadFile', 'Upload file request received', path);
        const file = await this.ai.files.upload({
            file: path,
            config: {
                mimeType: mimeType
            }
        });
        let getFile = await this.ai.files.get({name: file.name});
        while (getFile.state === 'PROCESSING') {
            getFile = await this.ai.files.get({name: file.name});
            this.logger.log('Gemini/uploadFile', 'Current file status', getFile.state);
            this.logger.log('Gemini/uploadFile', 'File is still processing, retrying in 1 seconds, current file status', getFile.state);
            await new Promise((resolve) => {
                setTimeout(resolve, 1000);
            });
        }
        this.logger.log('Gemini/uploadFile', 'Current file status', getFile.state);
        return file;
    }

    /**
     * @param {express.Request} request
     * @param {express.Response} response
     * @returns {Promise<void>}
     */
    async generateImageHandler(request, response) {
        const {pdfData} = request.body;
        this.logger.log('Gemini/generateImageHandler', 'Generating presentation', pdfData);
        try {
            this.logger.log('Gemini/generateImageHandler', 'Upload file request received', pdfData.path);
            const file = await this.uploadFile(pdfData.path, pdfData.mimeType);
            const interactionParams = {
                model: this.config.MODEL_NAME,
                input: [{
                    type: 'user_input',
                    content: [{
                        type: 'document',
                        uri: file.uri,
                        mime_type: file.mimeType
                    }]
                }],
                system_instruction: instructions.SYSTEM_INSTRUCTION['GENERATE_BANANA_PROMPT'].join('\n'),
                stream: false,
                store: false
            };
            const interaction = await this.ai.interactions.create(interactionParams);
            await this.redis.rpush(this.geminiTokenUsageKey, JSON.stringify({
                userID: this.userID,
                type: 'GENERATE_BANANA_PROMPT',
                tokenCount: interaction.usage.total_tokens,
                timestamp: new Date().toISOString()
            }));
            const bananPrompt = JSON.parse(interaction.output_text);
            this.logger.log('Gemini/generateImageHandler', 'Generated prompt: ', bananPrompt);
            const bananaInteraction = await this.ai.interactions.create({
                model: this.config.BANANA_MODEL_NAME,
                input: bananPrompt,
                response_format: {
                    type: 'image',
                    mime_type: 'image/jpeg',
                    aspect_ratio: '16:9',
                    image_size: '1K'
                }
            });
            await this.redis.rpush(this.geminiTokenUsageKey, JSON.stringify({
                userID: this.userID,
                type: 'GENERATE_BANANA_IMAGE',
                tokenCount: bananaInteraction.usage.total_tokens,
                timestamp: new Date().toISOString()
            }));
            response.json(bananaInteraction);
        } catch (error) {
            this.logger.error('Gemini/streamInteractionHandler', 'Chat failed', error);
            response.write(`data: ${JSON.stringify({error: 'generate_error'})}\n\n`);
            response.end();
            response.status(500).json(this.createErrorResponse('Generating presentation failed'));
        } finally {
            await this.logger.save();
        }
    }

    /**
     *
     * @param {express.Request} request
     * @param {express.Response} response
     * @typedef {Object} GeminiCacheData
     * @property {string} geminiPersona
     * @property {Array} gameEngineStatistics
     * @property {Object} resourceData
     * @property {boolean} resourceData.regenerate
     * @property {string} geminiCacheData.resourceData.checksum
     * @returns {Promise<void>}
     */
    async streamInteractionHandler(request, response) {
        const {geminiChatID, geminiCacheID, message} = request.body;
        this.logger.log('Gemini/streamInteractionHandler', 'Stream chat request received', {
            geminiChatID,
            geminiCacheID,
            message
        });
        response.setHeader('Content-Type', 'text/event-stream');
        response.setHeader('Cache-Control', 'no-cache');
        response.setHeader('Connection', 'keep-alive');
        response.setHeader('X-Accel-Buffering', 'no');
        response.socket.setTimeout(0);
        try {
            const classyClient = new ClassyClient(this.url, this.logger);
            this.logger.log('Gemini/streamInteractionHandler', 'Getting chat history');
            const geminiCacheData = await classyClient.postData({
                sessionToken: this.sessionToken,
                command: 'getGeminiInteractionHistory',
                geminiInteractionID: geminiChatID,
                geminiInteractionCacheID: geminiCacheID
            });
            if (geminiCacheData.geminiPersona === 'GENERATOR') {
                this.logger.log('Gemini/streamInteractionHandler', 'Setting game engine average play times');
                geminiCacheData.gameEngineStatistics.forEach(gameEngine => {
                    instructions.SYSTEM_INSTRUCTION.GENERATOR.push(`- ${gameEngine.engine} games usually last for ${gameEngine.averageGameTime} seconds.`);
                });
            }
            const interactionParams = {
                model: this.config.MODEL_NAME,
                input: [],
                system_instruction: instructions.SYSTEM_INSTRUCTION[geminiCacheData.geminiPersona].join('\n'),
                stream: true,
                store: true
            };
            const geminiFileData = {
                geminiFileURI: null,
                geminiFileExpireTime: null
            };
            if (geminiCacheData.resourceData.regenerate) {
                let fullFilePath;
                if (geminiCacheData.geminiPersona === 'GENERATOR') {
                    fullFilePath = geminiCacheData.resourceData.filePath;
                } else {
                    fullFilePath = path.join(this.config.MERGE_DIR, geminiCacheData.resourceData.filePath);
                    geminiCacheData.resourceData.command += ` "${fullFilePath}"`;
                    this.logger.log('Gemini/streamInteractionHandler', 'Run merge command', geminiCacheData.resourceData.command);
                    const mergeCommandResult = execSync(geminiCacheData.resourceData.command, {encoding: 'utf8'});
                    this.logger.log('Gemini/streamInteractionHandler', 'Merge command result', mergeCommandResult);
                }
                this.logger.log('Gemini/streamInteractionHandler', 'Upload file request received', fullFilePath);
                const file = await this.ai.files.upload({
                    file: fullFilePath,
                    config: {
                        mimeType: geminiCacheData.resourceData.mimeType
                    }
                });
                let getFile = await this.ai.files.get({name: file.name});
                while (getFile.state === 'PROCESSING') {
                    getFile = await this.ai.files.get({name: file.name});
                    this.logger.log('Gemini/streamInteractionHandler', 'Current file status', getFile.state);
                    this.logger.log('Gemini/streamInteractionHandler', 'File is still processing, retrying in 1 seconds, current file status', getFile.state);
                    await new Promise((resolve) => {
                        setTimeout(resolve, 1000);
                    });
                }
                this.logger.log('Gemini/streamInteractionHandler', 'Current file status', getFile.state);
                geminiFileData.geminiAIFileURI = file.uri;
                geminiFileData.geminiAIUploadExpireTime = file.expirationTime;
                interactionParams.input.push({
                    type: 'user_input',
                    content: [{
                        type: 'document',
                        uri: file.uri,
                        mime_type: file.mimeType
                    }]
                });
                if (geminiCacheData.geminiPersona !== 'GENERATOR') {
                    this.logger.log('Gemini/streamInteractionHandler', 'Delete merged file', fullFilePath);
                    await fs.promises.unlink(fullFilePath);
                }
            }
            if (geminiCacheData.history.length > 0) {
                this.logger.log('Gemini/streamInteractionHandler', 'Formatting chat history into interaction steps');
                for (const msg of geminiCacheData.history) {
                    const content = [];
                    for (const part of msg.parts) {
                        content.push({
                            text: part.text,
                            type: 'text'
                        });
                    }
                    interactionParams.input.push({
                        type: msg.role,
                        content
                    });
                }
            } else if (geminiCacheData.history.length === 0 && !geminiCacheData.resourceData.regenerate && geminiCacheData.resourceData.geminiFileURI) {
                interactionParams.input.push({
                    type: 'user_input',
                    content: [{
                        type: 'document',
                        uri: geminiCacheData.resourceData.geminiFileURI,
                        mime_type: geminiCacheData.resourceData.mimeType
                    }]
                });
            }
            interactionParams.input.push({
                type: 'user_input',
                content: [{
                    text: message,
                    type: 'text'
                }]
            });
            if (geminiCacheData.interactionID != null) {
                interactionParams.previous_interaction_id = geminiCacheData.interactionID;
            }
            this.logger.log('Gemini/streamInteractionHandler', 'Starting chat interaction', {stepsCount: interactionParams.input.length});
            const chatStream = await this.ai.interactions.create(interactionParams);
            let chatResponse = '';
            let totalTokenCount = 0;
            let interactionID = null;
            for await (const chunk of chatStream) {
                if (chunk.event_type === 'step.delta' && chunk.delta?.type === 'text') {
                    const text = chunk.delta.text;
                    if (text) {
                        chatResponse += text;
                        response.write(`data: ${JSON.stringify({text})}\n\n`);
                    }
                } else if (chunk.event_type === 'interaction.completed') {
                    if (chunk.interaction?.usage?.total_tokens) {
                        totalTokenCount = chunk.interaction.usage.total_tokens;
                        interactionID = chunk.interaction.id;
                    }
                }
            }
            response.write(`data: ${JSON.stringify({done: true})}\n\n`);
            response.end();
            this.logger.log('Gemini/streamInteractionHandler', 'Interaction response generated text', chatResponse);
            await this.redis.rpush(this.geminiTokenUsageKey, JSON.stringify({
                userID: this.userID,
                type: 'CHAT',
                tokenCount: totalTokenCount,
                timestamp: new Date().toISOString()
            }));
            await classyClient.postData({
                sessionToken: this.sessionToken,
                command: 'saveGeminiInteractionResponse',
                geminiInteractionID: geminiChatID,
                geminiInteractionCacheID: geminiCacheID,
                userMessage: message,
                geminiResponse: chatResponse,
                interactionID: interactionID,
                geminiFileURI: geminiFileData.geminiAIFileURI,
                geminiFileExpireTime: geminiFileData.geminiAIUploadExpireTime,
                resourceChecksum: geminiCacheData.resourceData.checksum
            });
        } catch (error) {
            this.logger.error('Gemini/streamInteractionHandler', 'Chat failed', error);
            response.write(`data: ${JSON.stringify({error: 'stream_error'})}\n\n`);
            response.end();
            response.status(500).json(this.createErrorResponse('Chat failed'));
        } finally {
            await this.logger.save();
        }
    }
}

module.exports = Gemini;