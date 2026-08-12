// Alquirves: sistema Instituto Academy Alquirves
// Domínio alvo: instituto.academy/alrquives
// Login por ACDM ID + senha, com codigo de validacao enviado via WhatsApp (bot conexos).

const path = require('path');
const express = require('express');

const { isDbReady, getModels, hashPassword, verifyPassword } = require('../../db/mongo');
const { getActiveSocket } = require('../../bot_src/socket');
const {
    SESSION_COOKIE,
    getSessionFromReq,
    createSession,
    destroySession,
    parseCookies,
    setSessionCookie,
    clearSessionCookie
} = require('./session');

const ALRQUIVES_BASE = '/alrquives';
const STATIC_DIR = path.resolve(__dirname, '..', '..', 'public', 'alrquives');
const CODE_TTL_MS = 5 * 60 * 1000;
const CODE_CLEANUP_INTERVAL = 60 * 1000;

const codeStore = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [key, value] of codeStore) {
        if (value.expiresAt < now) {
            codeStore.delete(key);
        }
    }
}, CODE_CLEANUP_INTERVAL);

function generateCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizeAcdmId(id) {
    return String(id || '').replace(/\s/g, '').toUpperCase();
}

function serveFile(res, fileName) {
    res.sendFile(path.join(STATIC_DIR, fileName));
}

function requireLogin(req, res, next) {
    const session = getSessionFromReq(req);
    if (!session) {
        return res.redirect(`${ALRQUIVES_BASE}/login.html`);
    }
    req.alquirvesSession = session;
    next();
}

function apiLogin(req, res, next) {
    const session = getSessionFromReq(req);
    if (!session) {
        return res.status(401).json({ error: 'Sessao invalida ou expirada.' });
    }
    req.alquirvesSession = session;
    next();
}

const STATUSES = ['finalizado', 'analise', 'adiado', 'emissao', 'solicitacao', 'vencido'];

const avatarCache = new Map();
const AVATAR_TTL_MS = 6 * 60 * 60 * 1000;

async function resolveAvatar(jid) {
    if (!jid) {
        return null;
    }
    const cached = avatarCache.get(jid);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.url;
    }
    try {
        const socket = getActiveSocket();
        if (!socket || typeof socket.profilePictureUrl !== 'function') {
            return null;
        }
        const url = await socket.profilePictureUrl(jid, 'image');
        avatarCache.set(jid, { url, expiresAt: Date.now() + AVATAR_TTL_MS });
        return url;
    } catch (_error) {
        return null;
    }
}

function emptyCounters() {
    return {
        finalizados: 0,
        analise: 0,
        adiado: 0,
        emissao: 0,
        solicitacao: 0,
        vencidos: 0
    };
}

async function buildDashboardData() {
    const { UserProfile, RegisteredGroup, AlrquivesRecord } = getModels();

    const membros = await UserProfile.countDocuments({});
    const acessos = await RegisteredGroup.countDocuments({});

    const statusAgg = await AlrquivesRecord.aggregate([
        { $group: { _id: '$status', n: { $sum: 1 } } }
    ]);

    const filtros = emptyCounters();
    statusAgg.forEach((row) => {
        if (filtros[row._id] !== undefined) {
            filtros[row._id] = row.n;
        }
    });

    const avl = (await AlrquivesRecord.find({ tipo: 'avl' }).sort({ createdAt: -1 }).limit(30).lean())
        .map((r) => ({
            id: r._id,
            titulo: r.titulo,
            licenciado: r.licenciado,
            licenciante: r.licenciante,
            validade: r.validade,
            status: r.status,
            criadoEm: r.createdAt
        }));

    const certs = (await AlrquivesRecord.find({ tipo: 'cert' }).sort({ createdAt: -1 }).limit(30).lean())
        .map((r) => ({
            id: r._id,
            titulo: r.titulo,
            outorgado: r.outorgado,
            organizacao: r.organizacao,
            validade: r.validade,
            status: r.status,
            criadoEm: r.createdAt
        }));

    const rankOrder = { Dev: 0, Master: 1, Membro: 2 };
    const users = await UserProfile.find({
        acdmId: { $exists: true, $ne: null, $ne: '' },
        name: { $exists: true, $ne: null, $ne: '' }
    }).lean();

    const looksValidName = (n) => {
        const t = String(n || '').trim();
        if (t.length < 2 || /^\d+$/.test(t)) {
            return false;
        }
        if (/bot|divulga/i.test(t)) {
            return false;
        }
        return true;
    };

    const top = users
        .filter((u) => looksValidName(u.name))
        .sort((a, b) => {
            const ra = rankOrder[a.rank] !== undefined ? rankOrder[a.rank] : 3;
            const rb = rankOrder[b.rank] !== undefined ? rankOrder[b.rank] : 3;
            if (ra !== rb) {
                return ra - rb;
            }
            return (Number(b.totalMessageCount) || 0) - (Number(a.totalMessageCount) || 0);
        })
        .slice(0, 15);

    const ids = top.map((u) => u.acdmId);

    const avatarResults = await Promise.allSettled(top.map((u) => resolveAvatar(u.jid || (u.lid ? `${u.lid}@lid` : null))));

    const userCountsMap = {};
    const userAgg = await AlrquivesRecord.aggregate([
        {
            $match: {
                $or: [
                    { licenciado: { $in: ids } },
                    { outorgado: { $in: ids } }
                ]
            }
        },
        {
            $group: {
                _id: { id: { $ifNull: ['$licenciado', '$outorgado'] }, status: '$status' },
                n: { $sum: 1 }
            }
        }
    ]);
    userAgg.forEach((row) => {
        const id = row._id && row._id.id;
        if (!id) {
            return;
        }
        userCountsMap[id] = userCountsMap[id] || emptyCounters();
        if (userCountsMap[id][row._id.status] !== undefined) {
            userCountsMap[id][row._id.status] = row.n;
        }
    });

    const usersOut = top.map((u, i) => ({
        acdmId: u.acdmId,
        name: u.name,
        rank: u.rank || 'Membro',
        counts: userCountsMap[u.acdmId] || emptyCounters(),
        avatar: avatarResults[i] && avatarResults[i].status === 'fulfilled' ? avatarResults[i].value : null
    }));

    return { membros, acessos, filtros, avl, certs, users: usersOut };
}

module.exports = function registerAlrquivesEndpoints(app, deps) {
    app.use(`${ALRQUIVES_BASE}/src`, express.static(path.join(STATIC_DIR, 'src')));

    app.get(ALRQUIVES_BASE, (req, res) => {
        if (getSessionFromReq(req)) {
            return res.redirect(`${ALRQUIVES_BASE}/home`);
        }
        return res.redirect(`${ALRQUIVES_BASE}/login.html`);
    });

    app.get([`${ALRQUIVES_BASE}/login`, `${ALRQUIVES_BASE}/login.html`], (req, res) => {
        if (getSessionFromReq(req)) {
            return res.redirect(`${ALRQUIVES_BASE}/home`);
        }
        return serveFile(res, 'login.html');
    });

    app.post(`${ALRQUIVES_BASE}/login`, async (req, res) => {
        try {
            if (getSessionFromReq(req)) {
                return res.status(400).json({ error: 'Você já está logado neste navegador. Encerre a sessão antes de acessar outra conta.' });
            }

            const { id, senha } = req.body || {};
            const acdmId = normalizeAcdmId(id);
            const password = String(senha || '');

            if (!acdmId || !password) {
                return res.status(400).json({ error: 'Informe o ACDM ID e a senha.' });
            }

            if (!isDbReady()) {
                return res.status(503).json({ error: 'Banco de dados indisponivel. Tente novamente em instantes.' });
            }

            const { UserProfile, AcessProfile } = getModels();

            const user = await UserProfile.findOne({ acdmId });
            if (!user) {
                return res.status(404).json({ error: 'ACDM ID nao encontrado.' });
            }

            const phone = String(user.phoneNumber || '').replace(/\D/g, '');
            if (!phone) {
                return res.status(400).json({ error: 'Este membro nao possui telefone cadastrado.' });
            }

            const acess = await AcessProfile.findOne({ acdmId });
            let accountCreated = false;

            if (acess) {
                if (!verifyPassword(password, acess.passwordHash)) {
                    return res.status(401).json({ error: 'Senha incorreta.' });
                }
            } else {
                await AcessProfile.create({
                    acdmId,
                    passwordHash: hashPassword(password),
                    name: user.name || ''
                });
                accountCreated = true;
            }

            const code = generateCode();
            codeStore.set(acdmId, {
                code,
                phone,
                acdmId,
                expiresAt: Date.now() + CODE_TTL_MS,
                used: false
            });

            try {
                await deps.sendToPhone(
                    `🔐 Seu codigo de acesso do Alquirves: ${code}\n\nValido por 5 minutos.`,
                    phone
                );
            } catch (error) {
                codeStore.delete(acdmId);
                console.error('[ALQUIRVES] Erro ao enviar codigo:', error && error.message ? error.message : error);
                return res.status(500).json({ error: 'Erro ao enviar o codigo. Verifique se o bot esta conectado.' });
            }

            return res.json({
                success: true,
                accountCreated,
                message: accountCreated ? 'Conta criada. Codigo enviado.' : 'Codigo enviado.'
            });
        } catch (error) {
            console.error('[ALQUIRVES] Erro no login:', error);
            return res.status(500).json({ error: 'Erro interno no login.' });
        }
    });

    app.get([`${ALRQUIVES_BASE}/code`, `${ALRQUIVES_BASE}/code.html`], (req, res) => {
        if (getSessionFromReq(req)) {
            return res.redirect(`${ALRQUIVES_BASE}/home`);
        }
        return serveFile(res, 'code.html');
    });

    app.post(`${ALRQUIVES_BASE}/verificar-codigo`, async (req, res) => {
        try {
            if (getSessionFromReq(req)) {
                return res.status(400).json({ error: 'Você já está logado neste navegador. A confirmação por código só é válida para quem ainda não entrou.' });
            }

            const { id, codigo } = req.body || {};
            const acdmId = normalizeAcdmId(id);
            const code = String(codigo || '').trim();

            if (!acdmId || !code) {
                return res.status(400).json({ error: 'Informe o ACDM ID e o codigo.' });
            }

            const stored = codeStore.get(acdmId);
            if (!stored) {
                return res.status(400).json({ error: 'Nenhum codigo enviado para este ACDM ID.' });
            }

            if (stored.used || stored.expiresAt < Date.now()) {
                codeStore.delete(acdmId);
                return res.status(400).json({ error: 'Codigo expirado. Solicite um novo.' });
            }

            if (stored.code !== code) {
                return res.status(400).json({ error: 'Codigo invalido.' });
            }

            codeStore.delete(acdmId);

            let user = null;
            if (isDbReady()) {
                try {
                    const { UserProfile } = getModels();
                    user = await UserProfile.findOne({ acdmId });
                } catch (_error) {
                    user = null;
                }
            }

            const token = createSession({
                acdmId,
                name: user && user.name ? user.name : '',
                phoneNumber: stored.phone,
                rank: user && user.rank ? user.rank : ''
            });

            setSessionCookie(res, token);
            return res.json({ success: true, redirect: `${ALRQUIVES_BASE}/home` });
        } catch (error) {
            console.error('[ALQUIRVES] Erro ao verificar codigo:', error);
            return res.status(500).json({ error: 'Erro interno ao verificar o codigo.' });
        }
    });

    app.post(`${ALRQUIVES_BASE}/logout`, (req, res) => {
        const cookies = parseCookies(req);
        destroySession(cookies[SESSION_COOKIE]);
        clearSessionCookie(res);
        res.json({ success: true });
    });

    app.get(`${ALRQUIVES_BASE}/me`, apiLogin, (req, res) => {
        const { acdmId, name, rank, phoneNumber } = req.alquirvesSession;
        res.json({ acdmId, name, rank, phoneNumber });
    });

    app.get(`${ALRQUIVES_BASE}/dados`, apiLogin, async (req, res) => {
        try {
            if (!isDbReady()) {
                return res.status(503).json({ error: 'Banco de dados indisponivel.' });
            }
            const data = await buildDashboardData();
            return res.json(data);
        } catch (error) {
            console.error('[ALQUIRVES] Erro ao montar dashboard:', error);
            return res.status(500).json({ error: 'Erro interno ao montar o dashboard.' });
        }
    });

    app.post(`${ALRQUIVES_BASE}/emitir`, apiLogin, async (req, res) => {
        try {
            if (!isDbReady()) {
                return res.status(503).json({ error: 'Banco de dados indisponivel.' });
            }

            const body = req.body || {};
            const tipo = String(body.tipo || '').toLowerCase();
            if (tipo !== 'avl' && tipo !== 'cert') {
                return res.status(400).json({ error: 'Tipo de emissao invalido.' });
            }

            const { AlrquivesRecord } = getModels();
            const record = await AlrquivesRecord.create({
                tipo,
                status: 'emissao',
                titulo: String(body.titulo || '').trim(),
                licenciado: String(body.licenciado || '').trim().toUpperCase(),
                licenciante: String(body.licenciante || '').trim(),
                outorgado: String(body.outorgado || '').trim(),
                organizacao: String(body.organizacao || '').trim(),
                validade: String(body.validade || '').trim(),
                criadoPor: req.alquirvesSession.acdmId
            });

            return res.json({ success: true, id: record._id });
        } catch (error) {
            console.error('[ALQUIRVES] Erro ao emitir:', error);
            return res.status(500).json({ error: 'Erro interno ao emitir.' });
        }
    });

    app.get(`${ALRQUIVES_BASE}/instit/dados`, apiLogin, async (req, res) => {
        try {
            if (!isDbReady()) {
                return res.status(503).json({ error: 'Banco de dados indisponivel.' });
            }

            const { UserProfile, AcessProfile, RegisteredGroup, AlrquivesRecord } = getModels();

            const membros = await UserProfile.countDocuments({});
            const acessos = await RegisteredGroup.countDocuments({});

            const statusAgg = await AlrquivesRecord.aggregate([
                { $group: { _id: '$status', n: { $sum: 1 } } }
            ]);

            const filtros = emptyCounters();
            statusAgg.forEach((row) => {
                if (filtros[row._id] !== undefined) {
                    filtros[row._id] = row.n;
                }
            });

            const contas = (await AcessProfile.find({}).sort({ createdAt: 1 }).lean())
                .map((c) => ({
                    acdmId: c.acdmId,
                    name: c.name || '',
                    criadoEm: c.createdAt
                }));

            const grupos = (await RegisteredGroup.find({}).lean())
                .map((g) => ({
                    name: g.name || '',
                    nick: g.nick || '',
                    desc: g.desc || '',
                    link: g.link || ''
                }));

            const avl = (await AlrquivesRecord.find({ tipo: 'avl' }).sort({ createdAt: -1 }).limit(30).lean())
                .map((r) => ({
                    id: r._id,
                    titulo: r.titulo,
                    licenciado: r.licenciado,
                    validade: r.validade,
                    status: r.status
                }));

            const advUsers = await UserProfile.find({
                $or: [
                    { globalWarnings: { $exists: true, $ne: [] } },
                    { localWarnings: { $exists: true, $ne: [] } }
                ]
            }).sort({ updatedAt: -1 }).limit(25).lean();

            const advertencias = [];
            advUsers.forEach((u) => {
                const base = {
                    name: u.name || u.realName || 'Desconhecido',
                    acdmId: u.acdmId || ''
                };
                (u.localWarnings || []).forEach((w) => {
                    if (advertencias.length >= 40) return;
                    advertencias.push({ tipo: 'local', id: w.id, ...base, reason: w.reason, admin: w.admin, date: w.date, group: w.groupName || '', gid: w.groupJid || '' });
                });
                (u.globalWarnings || []).forEach((w) => {
                    if (advertencias.length >= 40) return;
                    advertencias.push({ tipo: 'global', id: w.id, ...base, reason: w.reason, admin: w.admin, date: w.date });
                });
            });

            return res.json({ membros, acessos, filtros, contas, grupos, avl, advertencias });
        } catch (error) {
            console.error('[ALQUIRVES] Erro ao montar instit:', error);
            return res.status(500).json({ error: 'Erro interno ao montar o INSTIT.' });
        }
    });

    app.get(`${ALRQUIVES_BASE}/instit/cargos`, apiLogin, async (req, res) => {
        try {
            if (!isDbReady()) {
                return res.status(503).json({ error: 'Banco de dados indisponivel.' });
            }
            const { InstitCargo } = getModels();
            const ownerId = String(req.alquirvesSession.acdmId || '');
            const doc = await InstitCargo.findOne({ ownerId }).lean();
            return res.json({ cargos: (doc && Array.isArray(doc.cargos)) ? doc.cargos : [] });
        } catch (error) {
            console.error('[ALQUIRVES] Erro ao carregar cargos:', error);
            return res.status(500).json({ error: 'Erro interno ao carregar cargos.' });
        }
    });

    app.post(`${ALRQUIVES_BASE}/instit/cargos`, apiLogin, async (req, res) => {
        try {
            if (!isDbReady()) {
                return res.status(503).json({ error: 'Banco de dados indisponivel.' });
            }
            const body = req.body || {};
            if (!Array.isArray(body.cargos)) {
                return res.status(400).json({ error: 'Cargos invalidos.' });
            }
            const { InstitCargo } = getModels();
            const ownerId = String(req.alquirvesSession.acdmId || '');
            const sanitized = body.cargos.map((c) => ({
                id: String(c.id || ''),
                name: String(c.name || ''),
                fixed: !!c.fixed,
                members: Array.isArray(c.members) ? c.members : [],
                acess: (c.acess && c.acess.mods && c.acess.cmds) ? c.acess : { mods: {}, cmds: {} },
                gid: String(c.gid || ''),
                acdmId: String(c.acdmId || '')
            }));
            await InstitCargo.updateOne(
                { ownerId },
                { $set: { cargos: sanitized } },
                { upsert: true }
            );
            return res.json({ ok: true });
        } catch (error) {
            console.error('[ALQUIRVES] Erro ao salvar cargos:', error);
            return res.status(500).json({ error: 'Erro interno ao salvar cargos.' });
        }
    });

    app.get([`${ALRQUIVES_BASE}/app`, `${ALRQUIVES_BASE}/app.html`], requireLogin, (req, res) => {
        return serveFile(res, 'app.html');
    });

    app.get(
        [
            `${ALRQUIVES_BASE}/home`,
            `${ALRQUIVES_BASE}/instit`,
            `${ALRQUIVES_BASE}/avl`,
            `${ALRQUIVES_BASE}/ficer`,
            `${ALRQUIVES_BASE}/assinermos`
        ],
        requireLogin,
        (req, res) => {
            return serveFile(res, 'app.html');
        }
    );

    return {
        registeredRoutes: [
            `GET ${ALRQUIVES_BASE} (login ou app)`,
            `GET/POST ${ALRQUIVES_BASE}/login`,
            `GET/POST ${ALRQUIVES_BASE}/code`,
            `POST ${ALRQUIVES_BASE}/verificar-codigo`,
            `POST ${ALRQUIVES_BASE}/logout`,
            `GET ${ALRQUIVES_BASE}/me`,
            `GET ${ALRQUIVES_BASE}/dados`,
            `POST ${ALRQUIVES_BASE}/emitir`,
            `GET ${ALRQUIVES_BASE}/instit/dados`,
            `GET ${ALRQUIVES_BASE}/instit/cargos (requer sessao)`,
            `POST ${ALRQUIVES_BASE}/instit/cargos (requer sessao)`,
            `GET ${ALRQUIVES_BASE}/app (requer sessao)`,
            `GET ${ALRQUIVES_BASE}/home|instit|avl|ficer|assinermos (requer sessao)`,
            `GET ${ALRQUIVES_BASE}/src/* (assets)`
        ]
    };
};
