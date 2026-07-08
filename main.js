// Controlador: orquestra a API Express e o bot WhatsApp

const express = require('express');
const bodyParser = require('body-parser');

const {
    startBot,
    sendToGroup,
    sendImageToGroup,
    sendToTargetGroup,
    getTargetGroupId
} = require('./bot');

const registerLondonEndpoints = require('./endpoints/fichas_london');
const registerTesteEndpoints = require('./endpoints/fichas_teste');
const registerDiretoriaEndpoints = require('./endpoints/fichas_diretoria_teste');

const PORT = Number(process.env.PORT || 30404);

const HIDE_BAILEYS_NOISE = process.env.HIDE_BAILEYS_NOISE !== 'false';

function printTerminalAlert(title, details) {
    const timestamp = new Date().toISOString();
    const safeDetails = details ? ` | ${details}` : '';

    console.error(`[ALERTA][${timestamp}] ${title}${safeDetails}`);
}

/**
 * Filtro leve de logs do Baileys
 * NÃO mexe em stdout/stderr (evita memory leak e travamentos)
 */
function setupBaileysNoiseFilter() {
    if (!HIDE_BAILEYS_NOISE) {
        return;
    }

    const originalLog = console.log.bind(console);
    const originalInfo = console.info.bind(console);

    const noisyPatterns = [
        /baileys/i,
        /recv/i,
        /sent node/i,
        /connection update/i,
        /keepalive/i,
        /noise handshake/i,
        /pairing/i,
        /qr/i
    ];

    const shouldSuppress = (args) => {
        try {
            const line = args.map((value) => {
                if (typeof value === 'string') {
                    return value;
                }

                try {
                    return JSON.stringify(value);
                } catch {
                    return String(value);
                }
            }).join(' ');

            return noisyPatterns.some((pattern) => pattern.test(line));
        } catch {
            return false;
        }
    };

    console.log = (...args) => {
        if (shouldSuppress(args)) {
            return;
        }

        originalLog(...args);
    };

    console.info = (...args) => {
        if (shouldSuppress(args)) {
            return;
        }

        originalInfo(...args);
    };
}

/**
 * Tratamento global de erros
 * Evita crash silencioso
 */
function setupGlobalErrorHandlers() {

    process.on('unhandledRejection', (reason) => {
        printTerminalAlert(
            'UNHANDLED_REJECTION',
            reason?.stack || reason?.message || String(reason)
        );
    });

    process.on('uncaughtException', (error) => {
        printTerminalAlert(
            'UNCAUGHT_EXCEPTION',
            error?.stack || error?.message || String(error)
        );
    });

    process.on('warning', (warning) => {
        printTerminalAlert(
            'NODE_WARNING',
            warning?.stack || warning?.message || String(warning)
        );
    });
}

/**
 * Monitoramento simples de memória
 */
function setupMemoryMonitor() {

    setInterval(() => {

        const used = process.memoryUsage();

        console.log('[MEMORY]', {
            rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
            external: `${Math.round(used.external / 1024 / 1024)}MB`
        });

    }, 1000 * 60 * 5); // 5 minutos
}

/**
 * Heartbeat
 * Ajuda a verificar se processo continua vivo
 */
function setupHeartbeat() {

    setInterval(() => {

        console.log(`[HEARTBEAT] ${new Date().toISOString()}`);

    }, 1000 * 60); // 1 minuto
}

async function bootstrap() {

    setupGlobalErrorHandlers();

    setupBaileysNoiseFilter();

    setupMemoryMonitor();

    setupHeartbeat();

    // 1. Criar aplicação Express
    const app = express();

    // 2. Configurar parsers
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(bodyParser.json());

    // 3. Health check (Render/Uptime)
    app.get('/healthz', (_req, res) => {

        res.status(200).json({
            ok: true,
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });

    });

    // 4. Dependências compartilhadas
    const deps = {
        sendToGroup,
        sendImageToGroup,
        sendToTargetGroup,
        getTargetGroupId
    };

    // 5. Registrar endpoints
    const london = registerLondonEndpoints(app, deps);

    const teste = registerTesteEndpoints(app, deps);

    const diretoria = registerDiretoriaEndpoints(app, deps);

    const registeredRoutes = [
        ...london.registeredRoutes,
        ...teste.registeredRoutes,
        ...diretoria.registeredRoutes
    ];

    // 6. Iniciar servidor HTTP
    const server = app.listen(PORT, '0.0.0.0', () => {

        console.log(`API rodando na porta ${PORT}`);

        registeredRoutes.forEach((route) => {
            console.log(`Endpoint carregado: ${route}`);
        });

    });

    /**
     * Evita conexões zumbis
     */
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

    /**
     * Tratamento de erros do servidor HTTP
     */
    server.on('error', (error) => {

        printTerminalAlert(
            'HTTP_SERVER_ERROR',
            error?.stack || error?.message || String(error)
        );

    });

    // 7. Iniciar bot WhatsApp
    console.log('Iniciando bot WhatsApp...');

    await startBot();

    console.log('Bot WhatsApp iniciado com sucesso.');
}

/**
 * Bootstrap principal
 */
bootstrap().catch((error) => {

    printTerminalAlert(
        'Falha ao iniciar aplicacao',
        error?.stack || error?.message || String(error)
    );

    console.error('Falha ao iniciar aplicacao:', error);

    process.exit(1);
});