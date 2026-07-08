const RPG_NAME = 'Diretoria';
const TESTE_ROUTE = `/enviar-ficha-${RPG_NAME}`;
const ID_DO_GRUPO = '120363392505564334@g.us';

function buildDiretoriaMessage(data) {
    const safeData = data && typeof data === 'object' ? data : {};

    return 'Jogador: ' + (safeData.jogador2 || 'Nao informado') + '\n' +
        'Digitos: ' + (safeData.digitos || 'Nao informado') + '\n' +
        'Hierarquia: ' + (safeData.hierarquia || 'Nao informado') + '\n\n' +
        'Segredo: ' + (safeData.segredo || 'Nao informado') + '\n'
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

module.exports = function registerDiretoriaEndpoints(app, deps) {
    app.post(TESTE_ROUTE, async (req, res) => {
        const payload = getPayloadFromRequest(req);
        const message = buildDiretoriaMessage(payload);

        try {
            await deps.sendToGroup(message, ID_DO_GRUPO);

            res.status(200).send(
                '<html><body style="background:#1a1a1a;color:white;text-align:center;padding:50px;font-family:sans-serif;">' +
                '<h1>Ficha enviada</h1>' +
                '<p>Sua ficha foi postada no grupo com sucesso.</p>' +
                '<button onclick="window.history.back()">Voltar</button>' +
                '</body></html>'
            );
        } catch (error) {
            res.status(500).send('Erro ao enviar para o WhatsApp. Verifique ID_DO_GRUPO e conexao do bot.');
        }
    });

    return {
        registeredRoutes: [TESTE_ROUTE]
    };
};
