const path = require('path');

class GeminiConfig {
    constructor() {
        this.PORT = 3667;
        this.API_KEY = '****',;
        this.MODEL_NAME = 'gemini-3.7-flash';
        this.BANANA_MODEL_NAME = 'gemini-3.1-flash-image';
        this.LOG_DIR = path.join(__dirname, 'logs');
        this.MERGE_DIR = path.join(__dirname, 'merged');
        this.ALLOWED_IPS = ['::1',
            '127.0.0.1',
            '::ffff:127.0.0.1',
            '172.18.0.1',
            '::ffff:172.18.0.1'];
        this.JWT_SECRET = '****',;
    }
}

module.exports = GeminiConfig;
