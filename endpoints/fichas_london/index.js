const multer = require('multer');
let sharp = null;

try {
    // Optional dependency used only when we need to recover invalid image payloads.
    sharp = require('sharp');
} catch (_error) {
    sharp = null;
}

const RPG_NAME = 'london';
const LONDON_ROUTE = `/enviar-ficha-${RPG_NAME}`;
const ID_DO_GRUPO_LONDON = process.env.ID_DO_GRUPO_LONDON || process.env.ID_DO_GRUPO || '120363405538552038@g.us';
const ID_DO_GRUPO_ALERTAS = process.env.ID_DO_GRUPO_ALERTAS || process.env.ID_DO_GRUPO_LONDON || process.env.ID_DO_GRUPO || '';
const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const EXTENSION_BY_MIME = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff'
};

function normalizeMime(mime) {
    return String(mime || '').trim().toLowerCase();
}

function getExtensionFromName(fileName) {
    const name = String(fileName || '').trim();
    const parts = name.split('.');
    if (parts.length < 2) {
        return '';
    }

    return parts[parts.length - 1].toLowerCase();
}

function mimeFromExtension(extension) {
    switch (extension) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'bmp': return 'image/bmp';
    case 'tif':
    case 'tiff': return 'image/tiff';
    default: return null;
    }
}

function detectMimeBySignature(buffer) {
    if (!buffer || buffer.length < 12) {
        return null;
    }

    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
    }

    if (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
    ) {
        return 'image/png';
    }

    if (
        buffer[0] === 0x47 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x38 &&
        (buffer[4] === 0x37 || buffer[4] === 0x39) &&
        buffer[5] === 0x61
    ) {
        return 'image/gif';
    }

    if (
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
    ) {
        return 'image/webp';
    }

    if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
        return 'image/bmp';
    }

    if (
        (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
        (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
    ) {
        return 'image/tiff';
    }

    return null;
}

function isLikelyImageFile(file) {
    if (!file) {
        return false;
    }

    const providedMime = normalizeMime(file.mimetype);
    if (providedMime.startsWith('image/')) {
        return true;
    }

    const extension = getExtensionFromName(file.originalname);
    return Boolean(mimeFromExtension(extension));
}

async function convertBufferToJpeg(buffer) {
    if (!sharp) {
        throw new Error('Nao foi possivel converter imagem para JPEG porque a dependencia sharp nao esta instalada.');
    }

    const output = await sharp(buffer)
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();

    return {
        buffer: output,
        mimetype: 'image/jpeg',
        fileName: 'shape.jpg'
    };
}

async function normalizeShapeUpload(shapeFile) {
    if (!shapeFile || !shapeFile.buffer) {
        return null;
    }

    const providedMime = normalizeMime(shapeFile.mimetype);
    const extensionFromName = getExtensionFromName(shapeFile.originalname);
    const extensionMime = mimeFromExtension(extensionFromName);
    const detectedMime = detectMimeBySignature(shapeFile.buffer);

    const effectiveMime = detectedMime || providedMime || extensionMime || '';
    const shouldUseOriginal = ALLOWED_MIMES.has(effectiveMime);

    if (shouldUseOriginal) {
        return {
            imageBuffer: shapeFile.buffer,
            mimetype: detectedMime || (providedMime && ALLOWED_MIMES.has(providedMime) ? providedMime : ''),
            fileName: shapeFile.originalname || ''
        };
    }

    if (providedMime.startsWith('image/') || detectedMime || extensionMime) {
        const converted = await convertBufferToJpeg(shapeFile.buffer);

        return {
            imageBuffer: converted.buffer,
            mimetype: converted.mimetype,
            fileName: converted.fileName
        };
    }

    throw new Error('Arquivo enviado nao parece ser uma imagem valida.');
}

function buildUploadErrorMessage(uploadError) {
    if (!uploadError) {
        return 'Erro ao processar a imagem do shape. Verifique o arquivo enviado.';
    }

    if (uploadError.message === 'Tipo de arquivo nao suportado. Envie uma imagem.') {
        return uploadError.message;
    }

    if (uploadError.code === 'LIMIT_FILE_SIZE') {
        return `Imagem acima do limite permitido de ${Math.floor(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))}MB.`;
    }

    return 'Erro ao processar a imagem do shape. Verifique o arquivo enviado.';
}

const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (_req, file, cb) => {
        if (!isLikelyImageFile(file)) {
            cb(new Error('Tipo de arquivo nao suportado. Envie uma imagem.'));
            return;
        }

        cb(null, true);
    },
    limits: {
        fileSize: MAX_UPLOAD_SIZE_BYTES
    }
});

function buildLondonMessage(data) {
    const safeData = data && typeof data === 'object' ? data : {};

    return '\n' +
'    ㅤㅤㅤㅤ⏜⏜⃟̇◕✮̸࡙◯🍷⃞◍✾̸⃞⃔⃟\n' +
'                  𝐅ıchα de crıαçα̃o\n' +
'               𝐋𝐨𝐧𝐝𝐨𝐧 𝐓𝐡𝐞 𝐄𝐦𝐩𝐢𝐫𝐞\n' +
'                       𝐎𝐟 𝐒𝐞𝐜𝐫𝐞𝐭𝐬\n' +
'                         ⏝⏝\n' +
'                      𝐏lαчer\n\n' +
'🍷⃞◍ 𝐍ome/𝐍ıcknαme:\n' +
'      ━━ ' + (safeData.jogador || 'Nao informado') + '\n' +
'🍷⃞◍ 𝐖hαts𝐀pp:\n' +
'      ━━ ' + (safeData.telefone || 'Nao informado') + '\n' +
'🍷⃞◍ 𝐈dαde:\n' +
'      ━━ ' + (safeData.idade || 'Nao informado') + '\n' +
'🍷⃞◍ 𝐃ısponıbılıdαde:\n' +
'      ━━ ' + (safeData.disponibilidade || 'Nao informado') + '\n' +
'🍷⃞◍ 𝐂enα de suα αutorıα (+15 lınhαs)\n' +
'      ━━ ' + (safeData.cena || 'Nao informado') + '\n\n' +

'                      𝐏ersonαgem\n\n' +
'🍷⃞◍ 𝐍ome:\n' +
'      ━━ ' + (safeData.personagem || 'Nao informado') + '\n' +
'🍷⃞◍ 𝐈dαde:\n' +
'      ━━ ' + (safeData.idade2 || 'Nao informado') + '\n' +
'🍷⃞◍ 𝐒hαpe:\n' +
'      ━━ ' + (safeData.shapename || 'Nao informado') + '\n' +
'🍷⃞◍ 𝐏rofıssα̃o:\n' +
'      ━━ ' + (safeData.profissao || 'Nao informado') + '\n' +
'🍷⃞◍ 𝐇ıstórıα:\n' +
'      ━━ ' + (safeData.historia || 'Nao informado') + '\n' +
'🍷⃞◍ 𝐏ersonαlıdαde:\n' +
'      ━━ ' + (safeData.persona || 'Nao informado') + '\n' +
'🍷⃞◍ 𝐅αmı́lıα:\n' +
'      ━━ ' + (safeData.familia || 'Nao informado') + '\n' +
'🍷⃞◍ 𝐒egredo:\n' +
'     ━━ ' + (safeData.segredo || 'Nao informado') + '(Enviar o segredo no link abaixo)' + '\n' +
'https://london.acdm.online#rawhtml-3aba8688\n\n' +
'ㅤㅤㅤ    ㅤ๑    ࣪ 🍒⃞ ֶָ֢     ᩙᰰ   ۪  ✿̱  ໋ 𓂃\n' +
' ㅤㅤ    ⸼   ࣪ 𝗖ᥱ𐑾̱ᥱ𝗷เ࣪ꪀ𝗵α 𝐁𐑙࣭ᨷຮ໋ຮ 𖥔\n' +
'                  ᵈᵉˢⁱᵍⁿ ᵃⁿᵈ ᵒʳⁿᵃᵐᵉⁿᵗˢ\n'
}

function getPayloadFromRequest(req) {
    if (req.body && typeof req.body === 'object') {
        return req.body;
    }

    if (typeof req.body === 'string') {
        try {
            return JSON.parse(req.body);
        } catch (_error) {
            return {};
        }
    }

    return {};
}

function isMultipartRequest(req) {
    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    return contentType.includes('multipart/form-data');
}

function buildErrorNotification(details) {
    const safeDetails = details && typeof details === 'object' ? details : {};
    const rawErrorMessage = safeDetails.error && safeDetails.error.message ? safeDetails.error.message : String(safeDetails.error || 'Erro desconhecido');
    const errorMessage = rawErrorMessage.length > 600 ? `${rawErrorMessage.slice(0, 600)}...` : rawErrorMessage;

    return [
        '[BOT] Falha no endpoint de ficha',
        `Rota: ${safeDetails.route || 'nao informada'}`,
        `Etapa: ${safeDetails.stage || 'nao informada'}`,
        `IP: ${safeDetails.ip || 'nao informado'}`,
        `Tem shape: ${safeDetails.hasShape ? 'sim' : 'nao'}`,
        `Erro: ${errorMessage}`
    ].join('\n');
}

async function notifyErrorToBot(deps, details) {
    if (!ID_DO_GRUPO_ALERTAS || !deps || typeof deps.sendToGroup !== 'function') {
        return;
    }

    try {
        const text = buildErrorNotification(details);
        await deps.sendToGroup(text, ID_DO_GRUPO_ALERTAS);
    } catch (notifyError) {
        console.error('Falha ao notificar erro no WhatsApp:', notifyError && notifyError.message ? notifyError.message : notifyError);
    }
}

async function sendMessageWithOptionalShape(deps, groupId, shapeFile, message) {
    if (!shapeFile || !shapeFile.buffer) {
        await deps.sendToGroup(message, groupId);
        return;
    }

    const normalizedShape = await normalizeShapeUpload(shapeFile);

    const mediaMessage = {
        image: normalizedShape.imageBuffer,
        caption: message
    };

    // If metadata is unavailable, we intentionally omit it and let the WhatsApp layer infer.
    if (normalizedShape.mimetype) {
        mediaMessage.mimetype = normalizedShape.mimetype;
    }

    if (normalizedShape.fileName) {
        const extension = getExtensionFromName(normalizedShape.fileName);
        const allowedExtension = EXTENSION_BY_MIME[mediaMessage.mimetype] || extension;
        mediaMessage.fileName = extension ? normalizedShape.fileName : `shape.${allowedExtension || 'jpg'}`;
    }

    if (typeof deps.sendImageToGroup === 'function') {
        await deps.sendImageToGroup(mediaMessage, groupId);
        return;
    }

    if (deps.sock && typeof deps.sock.sendMessage === 'function') {
        await deps.sock.sendMessage(groupId, mediaMessage);
        return;
    }

    if (deps.client && typeof deps.client.sendMessage === 'function') {
        await deps.client.sendMessage(groupId, mediaMessage);
        return;
    }

    throw new Error('Funcao de envio de imagem nao encontrada em deps.');
}

module.exports = function registerLondonEndpoints(app, deps) {
    app.post(LONDON_ROUTE, (req, res) => {
        const processRequest = async () => {
            const payload = getPayloadFromRequest(req);
            const shapeFile = req.file || null;

            if (shapeFile) {
                payload.shape = shapeFile.originalname || 'Imagem anexada';
            }

            const message = buildLondonMessage(payload);

            try {
                await sendMessageWithOptionalShape(deps, ID_DO_GRUPO_LONDON, shapeFile, message);
                console.log(
                    `[OK][ENDPOINT:${LONDON_ROUTE}] ip=${req.ip} hasShape=${Boolean(shapeFile && shapeFile.buffer)} group=${ID_DO_GRUPO_LONDON}`
                );

                res.status(200).send(
                    '<html><body style="background:#1a1a1a;color:white;text-align:center;padding:100px;font-family:sans-serif;">' +
                    '<h1>Ficha enviada</h1>' +
                    '<p>Sua ficha foi postada no grupo com sucesso.</p>' +
                    '<button onclick="window.history.back()">Voltar</button>' +
                    '</body></html>'
                );
            } catch (error) {
                console.error(
                    `[ALERTA][ENDPOINT:${LONDON_ROUTE}] etapa=send-message ip=${req.ip} hasShape=${Boolean(shapeFile && shapeFile.buffer)} erro=${error && error.message ? error.message : error}`
                );

                await notifyErrorToBot(deps, {
                    route: LONDON_ROUTE,
                    stage: 'send-message',
                    ip: req.ip,
                    hasShape: Boolean(shapeFile && shapeFile.buffer),
                    error
                });

                const statusCode = String(error.message || '').includes('imagem') ? 400 : 500;
                res.status(statusCode).send(statusCode === 400
                    ? error.message
                    : 'Erro ao enviar para o WhatsApp. Verifique ID_DO_GRUPO e conexao do bot.');
            }
        };

        if (!isMultipartRequest(req)) {
            processRequest();
            return;
        }

        upload.single('shape')(req, res, (uploadError) => {
            if (uploadError) {
                console.error(
                    `[ALERTA][ENDPOINT:${LONDON_ROUTE}] etapa=multer-upload ip=${req.ip} hasShape=false erro=${uploadError && uploadError.message ? uploadError.message : uploadError}`
                );

                notifyErrorToBot(deps, {
                    route: LONDON_ROUTE,
                    stage: 'multer-upload',
                    ip: req.ip,
                    hasShape: false,
                    error: uploadError
                });

                res.status(400).send(buildUploadErrorMessage(uploadError));
                return;
            }

            processRequest();
        });
    });

    return {
        registeredRoutes: [LONDON_ROUTE]
    };
};