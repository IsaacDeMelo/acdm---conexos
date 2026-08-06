// Alquirves: front-end do sistema Instituto Academy Alquirves
// Domínio alvo: instituto.academy/alrquives
// Por enquanto apenas front-end estático.

const path = require('path');
const express = require('express');

const ALRQUIVES_BASE = '/alrquives';
const STATIC_DIR = path.resolve(__dirname, '..', '..', 'public', 'alrquives');

module.exports = function registerAlrquivesEndpoints(app) {
    app.use(ALRQUIVES_BASE, express.static(STATIC_DIR));

    const cleanUrlRedirects = [
        { from: '', to: 'login.html' },
        { from: '/login', to: 'login.html' },
        { from: '/code', to: 'code.html' },
        { from: '/app', to: 'app.html' }
    ];

    cleanUrlRedirects.forEach(({ from, to }) => {
        app.get(`${ALRQUIVES_BASE}${from}`, (_req, res) => {
            res.redirect(`${ALRQUIVES_BASE}/${to}`);
        });
    });

    return {
        registeredRoutes: [
            'GET /alrquives (front-end)',
            'GET /alrquives/login',
            'GET /alrquives/code',
            'GET /alrquives/app',
            `GET ${ALRQUIVES_BASE}/src/* (assets)`
        ]
    };
};
