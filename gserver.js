process.env.TZ = 'Europe/Budapest';
const GeminiServer = require('./Gemini');
const geminiServer = new GeminiServer();

process.on('SIGTERM', () => {
    geminiServer.logger.log('SIGTERM', 'Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    geminiServer.logger.log('SIGINT', 'Received SIGINT, shutting down gracefully');
    process.exit(0);
});