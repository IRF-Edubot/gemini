const axios = require('axios');

/**
 * @class ClassyClient
 * @description Makes requests to the Classy API
 */
class ClassyClient {
    /**
     * @constructor
     * @param {string} url
     * @param {Logger} logger
     */
    constructor(url, logger) {
        this.url = url;
        this.logger = logger;
        this.config = {
            timeout: 60000,
            headers: {'Content-Type': 'application/json'}
        };
        this.duck = {
            duckID: 'duckNode',
            duckVersion: 'duckNode',
            duckType: 'node',
            deviceTimeZone: Intl.DateTimeFormat()
                .resolvedOptions().timeZone
        };
        this.logger.log('ClassyClient/constructor', `Classy client initialized with URL: ${this.url}`);
    };

    /**
     * @async
     * @param {object} data
     * @returns {Promise<object>}
     */
    async postData(data) {
        data.duck = this.duck;
        this.logger.log('ClassyClient/postData', `Sending Classy request: ${JSON.stringify(data, null, 2)}`, data);
        const response = await axios.post(this.url, data, this.config);
        if (response.status === 200) {
            if (!response.data?.error) {
                this.logger.log('ClassyClient/postData', `Received data: ${JSON.stringify(response.data.answer, null, 2)}`, data);
                return response.data.answer;
            } else {
                throw new Error(`${response.data?.answer}`);
            }
        } else {
            throw new Error(`Classy communication error: ${response}`);
        }
    }
}

module.exports = ClassyClient;