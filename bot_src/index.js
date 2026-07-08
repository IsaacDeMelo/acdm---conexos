// Inicializa e orquestra o bot WhatsApp
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const { setActiveSocket } = require('./socket');
const { processCommand, executeCommand } = require('./commands');

async function initializeBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }) // <- corta os logs JSON do baileys
    });

    setActiveSocket(sock);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        const msg = messages[0];
        if (!msg || !msg.message) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        const commandName = processCommand(text);
        if (commandName) {
            await executeCommand(commandName, sender, sock);
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrcode.generate(qr, { small: true });
            console.log('Escaneie o QR Code exibido no terminal.');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)
                ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
                : true;

            if (shouldReconnect) {
                console.log('Reconectando bot...');
                initializeBot().catch((error) => {
                    console.error('Falha ao reconectar o bot:', error.message);
                });
            }
        } else if (connection === 'open') {
            console.log('Bot conectado com sucesso.');
        }
    });

    return sock;
}

module.exports = { initializeBot };