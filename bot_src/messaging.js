// Funções de envio de mensagens para grupos
const { getActiveSocket } = require('./socket');

const ID_DO_GRUPO_PADRAO = process.env.ID_DO_GRUPO || '120363392505564334@g.us';

function resolveGroupId(groupId) {
    return groupId || ID_DO_GRUPO_PADRAO;
}

async function sendToGroup(text, groupId) {
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

module.exports = {
    sendToGroup,
    sendImageToGroup,
    sendToTargetGroup,
    getTargetGroupId,
    resolveGroupId
};
