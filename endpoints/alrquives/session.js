// Sessões em memória do Alquirves
// Token randomico no cookie httpOnly + Map em memoria.

const crypto = require('crypto');

const SESSION_COOKIE = 'alquirves_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const sessions = new Map();

function createSession(profile) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, {
        acdmId: profile.acdmId,
        name: profile.name || '',
        phoneNumber: profile.phoneNumber || '',
        rank: profile.rank || '',
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_TTL_MS
    });
    return token;
}

function getSession(token) {
    if (!token) {
        return null;
    }

    const session = sessions.get(token);
    if (!session) {
        return null;
    }

    if (session.expiresAt < Date.now()) {
        sessions.delete(token);
        return null;
    }

    return session;
}

function destroySession(token) {
    sessions.delete(token);
}

function parseCookies(req) {
    const header = String(req.headers.cookie || '');
    const out = {};

    header.split(';').forEach((pair) => {
        const index = pair.indexOf('=');
        if (index !== -1) {
            const key = pair.slice(0, index).trim();
            const value = pair.slice(index + 1).trim();
            try {
                out[key] = decodeURIComponent(value);
            } catch (_error) {
                out[key] = value;
            }
        }
    });

    return out;
}

function setSessionCookie(res, token) {
    res.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
    );
}

function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function getSessionFromReq(req) {
    return getSession(parseCookies(req)[SESSION_COOKIE]);
}

module.exports = {
    SESSION_COOKIE,
    SESSION_TTL_MS,
    createSession,
    getSession,
    destroySession,
    parseCookies,
    setSessionCookie,
    clearSessionCookie,
    getSessionFromReq
};
