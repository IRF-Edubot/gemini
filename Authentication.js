const jwt = require('jsonwebtoken');

/**
 * @class Authentication
 * @description Verifies that the request comes from a trusted IP and that the session token is valid
 */
class Authentication {
    /**
     * @constructor
     * @param {GeminiConfig} config
     * @param {string} sessionToken
     * @param {string} ip
     * @param {Logger} logger
     */
    constructor(config, sessionToken, ip, logger) {
        this.config = config;
        this.sessionToken = sessionToken;
        this.ip = ip;
        this.logger = logger;
    }

    /**
     * @async
     * @returns {object}
     */
    authenticate() {
        let authentication = {
            success: false
        };
        if (this.validateRequestIP()) {
            try {
                const decoded = jwt.verify(this.sessionToken, this.config.JWT_SECRET);
                authentication = decoded;
                authentication.success = true;
                this.logger.log('Authentication/authenticate', `Authentication successful! ${JSON.stringify(decoded)}`);
            } catch (error) {
                this.logger.error('Authentication/authenticate', `Authentication failed!`, error);
            }
        } else {
            this.logger.warn('Authentication/authenticate', `Access denied for IP: ${this.ip}`);
        }
        return authentication;
    }

    /**
     * @returns {boolean}
     */
    validateRequestIP() {
        return this.config.ALLOWED_IPS.includes(this.ip);
    }
}

module.exports = Authentication;