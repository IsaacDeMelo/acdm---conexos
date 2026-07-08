// Handlers dos comandos WhatsApp (!grupo, !ping, etc)
const { getActiveSocket } = require('./socket');

const FIREBASE_RTDB_URL = process.env.FIREBASE_RTDB_URL || 'https://academy-conexos-default-rtdb.firebaseio.com';
const FIREBASE_PATH = process.env.FIREBASE_PATH || '/shared_data';

async function handleGrupoCommand(sender, sock) {
    const isGroup = sender.endsWith('@g.us');

    if (isGroup) {
        await sock.sendMessage(sender, {
            text: `ID deste grupo:\n\n${sender}\n\nCopie esse valor e use na variavel de ambiente ID_DO_GRUPO ou ID_DO_GRUPO_<NOME_RPG>.`
        });
    } else {
        await sock.sendMessage(sender, {
            text: 'Esse comando so pode ser usado dentro de um grupo.'
        });
    }
}

async function handlePingCommand(sender, sock) {
    await sock.sendMessage(sender, { text: 'pong' });
}

function sanitizeScope(scope) {
    return String(scope || '').trim().toLowerCase();
}

function normalizeFirebasePath(pathValue) {
    const normalized = String(pathValue || '/shared_data').trim();

    if (!normalized) {
        return '/shared_data';
    }

    if (normalized.startsWith('/')) {
        return normalized.replace(/\/+$/, '');
    }

    return `/${normalized.replace(/\/+$/, '')}`;
}

function buildFirebaseRecordUrl(scope) {
    const base = String(FIREBASE_RTDB_URL || '').trim().replace(/\/+$/, '');
    const safeScope = sanitizeScope(scope);
    const safePath = normalizeFirebasePath(FIREBASE_PATH);
    return `${base}${safePath}/${safeScope}.json`;
}

function buildFirebasePoolUrl() {
    const base = String(FIREBASE_RTDB_URL || '').trim().replace(/\/+$/, '');
    const safePath = normalizeFirebasePath(FIREBASE_PATH);
    return `${base}${safePath}.json`;
}

function parseBdCommand(text) {
    const raw = String(text || '').trim();
    const match = raw.match(/^\.bd\s+([a-z0-9_-]+)\s+([\s\S]+)$/i);

    if (!match) {
        return null;
    }

    const scope = sanitizeScope(match[1]);
    const valuePart = String(match[2] || '').trim();

    if (valuePart.toLowerCase() === 'review') {
        return {
            scope,
            action: scope === 'global' ? 'review_global' : 'review_scope'
        };
    }

    const jsonPart = valuePart;
    let payload;

    try {
        payload = JSON.parse(jsonPart);
    } catch (_error) {
        throw new Error('JSON invalido. Use: .bd <escopo> {"campo":"valor"}');
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('O payload do .bd precisa ser um objeto JSON.');
    }

    return { scope, payload };
}

async function readBdRecord(scope) {
    const response = await fetch(buildFirebaseRecordUrl(scope), {
        method: 'GET'
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Falha ao ler escopo ${scope} (${response.status}): ${errorBody.slice(0, 200)}`);
    }

    const data = await response.json();
    return data;
}

async function readBdPool() {
    const response = await fetch(buildFirebasePoolUrl(), {
        method: 'GET'
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Falha ao ler pool global (${response.status}): ${errorBody.slice(0, 200)}`);
    }

    const data = await response.json();
    return data;
}

async function saveBdRecord(scope, payload) {
    const record = {
        scope,
        payload,
        source: 'whatsapp-command',
        updatedAt: new Date().toISOString()
    };

    const response = await fetch(buildFirebaseRecordUrl(scope), {
        method: 'PUT',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify(record)
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Falha ao salvar no Firebase (${response.status}): ${errorBody.slice(0, 200)}`);
    }

    return record;
}

async function handleBdCommand(sender, sock, commandData) {
    const { scope, payload, action } = commandData;

    if (action === 'review_scope') {
        const record = await readBdRecord(scope);

        await sock.sendMessage(sender, {
            text: [
                `Review do escopo: ${scope}`,
                '',
                JSON.stringify(record || null, null, 2)
            ].join('\n')
        });

        return;
    }

    if (action === 'review_global') {
        const pool = await readBdPool();

        await sock.sendMessage(sender, {
            text: [
                'Review global do pool de dados',
                '',
                JSON.stringify(pool || {}, null, 2)
            ].join('\n')
        });

        return;
    }

    const saved = await saveBdRecord(scope, payload);

    await sock.sendMessage(sender, {
        text: [
            'Dados salvos com sucesso.',
            `Escopo: ${saved.scope}`,
            `Atualizado em: ${saved.updatedAt}`,
            `URL: ${buildFirebaseRecordUrl(saved.scope)}`
        ].join('\n')
    });
}

function processCommand(text) {
    if (!text) return null;

    const trimmedText = String(text).trim();

    if (trimmedText === '.bd help') {
        return { name: 'bd_help' };
    }

    if (trimmedText.startsWith('.bd ')) {
        try {
            const parsedBd = parseBdCommand(trimmedText);
            return {
                name: 'bd',
                data: parsedBd
            };
        } catch (error) {
            return {
                name: 'bd_error',
                data: {
                    message: error && error.message ? error.message : 'Comando .bd invalido.'
                }
            };
        }
    }

    if (trimmedText === '!grupo') {
        return { name: 'grupo' };
    }

    if (trimmedText === '!ping') {
        return { name: 'ping' };
    }

    return null;
}

async function executeCommand(commandName, sender, sock) {
    const normalizedCommand =
        commandName && typeof commandName === 'object'
            ? commandName
            : { name: commandName };

    switch (normalizedCommand.name) {
        case 'grupo':
            await handleGrupoCommand(sender, sock);
            break;
        case 'ping':
            await handlePingCommand(sender, sock);
            break;
        case 'bd_help':
            await sock.sendMessage(sender, {
                text: [
                    'ⓘ Academy Conexos - Firebase BD System',
                    '',
                    '1) Salvar dados em um escopo:',
                    '.bd nome_banco {"livro":"Harry Potter"}',
                    '',
                    '2) Ver dados de um escopo:',
                    '.bd nome_banco review',
                    '',
                    '3) Ver pool global:',
                    '.bd global review',
                    '',
                    'Regras:',
                    '- O escopo aceita letras, numeros, _ e -',
                    '- O payload precisa ser JSON valido (objeto)',
                    '- Exemplo invalido: .bd london texto-solto'
                ].join('\n')
            });
            break;
        case 'bd':
            try {
                await handleBdCommand(sender, sock, normalizedCommand.data);
            } catch (error) {
                await sock.sendMessage(sender, {
                    text: error && error.message
                        ? error.message
                        : 'Falha ao processar comando .bd.'
                });
            }
            break;
        case 'bd_error':
            await sock.sendMessage(sender, {
                text: normalizedCommand.data && normalizedCommand.data.message
                    ? normalizedCommand.data.message
                    : 'Comando .bd invalido. Use: .bd <escopo> {"campo":"valor"}'
            });
            break;
        default:
            break;
    }
}

module.exports = {
    processCommand,
    executeCommand
};
