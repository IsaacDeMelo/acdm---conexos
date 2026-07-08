// Executador: apenas chama o inicializador do bot
const { initializeBot } = require('./bot_src');
const { sendToGroup, sendImageToGroup, sendToTargetGroup, getTargetGroupId } = require('./bot_src/messaging');

async function startBot() {
    await initializeBot();
}

module.exports = {
    startBot,
    sendToGroup,
    sendImageToGroup,
    sendToTargetGroup,
    getTargetGroupId
};

if (require.main === module) {
    startBot().catch((error) => {
        console.error('Erro ao iniciar bot:', error.message);
        process.exit(1);
    });
}