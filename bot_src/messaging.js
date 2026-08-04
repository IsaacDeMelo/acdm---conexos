const fs = require('fs');
const path = require('path');

const { getActiveSocket, waitForConnection } = require('./socket');

const AUTH_DIR = path.resolve(__dirname, '..', 'auth_info_baileys');
const ID_DO_GRUPO_PADRAO = process.env.ID_DO_GRUPO || '120363392505564334@g.us';

function resolveGroupId(groupId) {
    return groupId || ID_DO_GRUPO_PADRAO;
}

async function sendToGroup(text, groupId) {
    await waitForConnection();
    const socket = getActiveSocket();

    if (!socket) {
        throw new Error('Bot do WhatsApp ainda nao conectado. Tente novamente em alguns segundos.');
    }

    const targetGroupId = resolveGroupId(groupId);

    if (!targetGroupId) {
        throw new Error('Nenhum ID de grupo foi configurado para este endpoint.');
    }

    await socket.sendMessage(targetGroupId, { text });
}

async function sendToTargetGroup(text) {
    await sendToGroup(text, ID_DO_GRUPO_PADRAO);
}

async function sendImageToGroup(mediaMessage, groupId) {
    await waitForConnection();
    const socket = getActiveSocket();

    if (!socket) {
        throw new Error('Bot do WhatsApp ainda nao conectado. Tente novamente em alguns segundos.');
    }

    const targetGroupId = resolveGroupId(groupId);

    if (!targetGroupId) {
        throw new Error('Nenhum ID de grupo foi configurado para este endpoint.');
    }

    if (!mediaMessage || !mediaMessage.image) {
        throw new Error('Envio de imagem invalido: campo image nao informado.');
    }

    if (!Buffer.isBuffer(mediaMessage.image)) {
        throw new Error('Envio de imagem invalido: campo image deve ser um Buffer.');
    }

    const imageSize = mediaMessage.image.length;
    const mime = mediaMessage.mimetype || 'nao-informado';
    const fileName = mediaMessage.fileName || 'nao-informado';
    console.log(`sendImageToGroup -> size=${imageSize} mime=${mime} file=${fileName}`);

    await socket.sendMessage(targetGroupId, mediaMessage);
}

function getTargetGroupId() {
    return ID_DO_GRUPO_PADRAO;
}

function readLidMapping(phone) {
    const mappingPath = path.join(AUTH_DIR, `lid-mapping-${phone}.json`);
    if (fs.existsSync(mappingPath)) {
        const lid = fs.readFileSync(mappingPath, 'utf8').replace(/"/g, '').trim();
        return lid || null;
    }
    return null;
}

function resolvePhoneJid(phone) {
    const cleaned = String(phone).replace(/\D/g, '');

    const lid = readLidMapping(cleaned);
    if (lid) {
        console.log(`[JID] Telefone ${cleaned} -> LID ${lid}@lid`);
        return `${lid}@lid`;
    }

    if (cleaned.length === 13 && cleaned.startsWith('55')) {
        const semNove = cleaned.slice(0, 4) + cleaned.slice(5);
        const lid2 = readLidMapping(semNove);
        if (lid2) {
            console.log(`[JID] Telefone ${cleaned} (sem 9) -> LID ${lid2}@lid`);
            return `${lid2}@lid`;
        }
    }

    console.log(`[JID] Telefone ${cleaned} -> ${cleaned}@s.whatsapp.net (sem LID)`);
    return `${cleaned}@s.whatsapp.net`;
}

async function sendToPhone(text, phoneNumber) {
    await waitForConnection();
    const socket = getActiveSocket();

    if (!socket) {
        throw new Error('Bot do WhatsApp ainda nao conectado. Tente novamente em alguns segundos.');
    }

    const jid = resolvePhoneJid(phoneNumber);

    console.log(`[SEND] Enviando para ${jid}: "${(text || '').slice(0, 80)}"`);
    await socket.sendMessage(jid, { text });
}

module.exports = {
    sendToGroup,
    sendImageToGroup,
    sendToTargetGroup,
    getTargetGroupId,
    resolveGroupId,
    sendToPhone
};
