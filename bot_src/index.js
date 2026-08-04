// Inicializa e orquestra o bot WhatsApp
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const { setActiveSocket, setConnecting, setConnected, setDisconnected } = require('./socket');
const { processCommand, executeCommand } = require('./commands');

async function initializeBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' })
    });

    setActiveSocket(sock);
    setConnecting();
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        const msg = messages[0];
        if (!msg || !msg.message) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (sender && !sender.endsWith('@g.us')) {
            console.log(`[MSG PV] De: ${sender} | Texto: "${(text || '').slice(0, 100)}"`);
        }

        const commandName = processCommand(text);
        if (commandName) {
            await executeCommand(commandName, sender, sock);
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('[QR CODE] Escaneie o QR Code exibido no terminal.');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            setConnected();
            console.log('[BOT] Conectado ao WhatsApp');
        }

        if (connection === 'close') {
            setDisconnected();

            let reason = 'desconhecido';
            if (lastDisconnect?.error instanceof Boom) {
                const statusCode = lastDisconnect.error.output.statusCode;
                reason = DisconnectReason[statusCode] || `codigo ${statusCode}`;
            } else if (lastDisconnect?.error) {
                reason = lastDisconnect.error.message || String(lastDisconnect.error);
            }

            console.log(`[BOT] Conexao fechada: ${reason}`);

            const delay = reason === 'loggedOut' ? 1000 : 3000;

            console.log(`[BOT] Reconectando em ${delay / 1000}s...`);
            setTimeout(() => {
                initializeBot().catch((error) => {
                    console.error('[BOT] Falha ao reconectar:', error.message);
                });
            }, delay);
        }
    });

    return sock;
}

module.exports = { initializeBot };