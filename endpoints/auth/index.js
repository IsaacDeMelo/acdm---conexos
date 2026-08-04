const AUTH_ROUTE_PREFIX = '/auth';
const CODE_EXPIRY_MS = 5 * 60 * 1000;
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

function normalizePhone(phone) {
    const digits = String(phone).replace(/\D/g, '');

    if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
        return '55' + digits;
    }

    return digits;
}

function renderLoginPage() {
    return '<!DOCTYPE html>' +
'<html lang="pt-BR">' +
'<head>' +
'<meta charset="UTF-8">' +
'<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'<title>Cadastro - Academy Conexos</title>' +
'<style>' +
'*{margin:0;padding:0;box-sizing:border-box}' +
'body{background:#111;color:#eee;font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh}' +
'.card{background:#1a1a1a;padding:40px 32px;border-radius:12px;width:100%;max-width:400px;margin:20px;border:1px solid #2a2a2a}' +
'.card h1{text-align:center;font-size:20px;font-weight:600;margin-bottom:4px}' +
'.card .sub{text-align:center;color:#888;font-size:13px;margin-bottom:28px}' +
'input{width:100%;padding:12px;background:#111;border:1px solid #2a2a2a;border-radius:8px;color:#eee;font-size:15px;outline:none;transition:border .2s}' +
'input:focus{border-color:#666}' +
'input.code-input{text-align:center;font-size:24px;letter-spacing:8px;padding:14px}' +
'label{display:block;font-size:13px;color:#888;margin-bottom:5px;margin-top:10px}' +
'label:first-of-type{margin-top:0}' +
'button{width:100%;padding:12px;background:#333;color:#eee;border:none;border-radius:8px;font-size:15px;cursor:pointer;margin-top:14px}' +
'button:hover{background:#444}' +
'button:disabled{background:#222;color:#666;cursor:not-allowed}' +
'.btn-back{background:transparent;border:1px solid #2a2a2a;color:#888;margin-top:6px}' +
'.btn-back:hover{background:#1a1a1a;color:#eee}' +
'.alert{padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:16px;display:none}' +
'.alert-error{background:#2a1010;border:1px solid #833;color:#e55}' +
'.alert-success{background:#102a10;border:1px solid #383;color:#3c3}' +
'.hidden{display:none}' +
'.step-indicator{display:flex;justify-content:center;gap:4px;margin-bottom:28px}' +
'.step-indicator span{width:28px;height:4px;border-radius:2px;background:#2a2a2a;transition:background .3s}' +
'.step-indicator span.active{background:#666}' +
'.step-indicator span.done{background:#3c3}' +
'.step{animation:fadeIn .25s ease}' +
'@keyframes fadeIn{from{opacity:0}to{opacity:1}}' +
'.success-box{text-align:center;padding:20px 0}' +
'.success-box h2{font-size:22px;margin-bottom:8px}' +
'.success-box p{color:#888;font-size:14px}' +
'.footer{text-align:center;margin-top:24px;font-size:11px;color:#444}' +
'.footer a{color:#555;text-decoration:none}' +
'.footer a:hover{color:#888}' +
'</style>' +
'</head>' +
'<body>' +
'<div class="card">' +
'<h1>Academy Conexos</h1>' +
'<p class="sub">Pre-cadastro de teste</p>' +

'<div class="step-indicator">' +
'<span class="active" id="s1"></span>' +
'<span id="s2"></span>' +
'<span id="s3"></span>' +
'</div>' +

'<div id="alertBox" class="alert"></div>' +

'<div id="step1" class="step">' +
'<label>Nome de usuario</label>' +
'<input type="text" id="nome" placeholder="Seu nome" maxlength="40" autocomplete="name">' +
'<label>WhatsApp</label>' +
'<input type="text" id="telefone" placeholder="(DD) 99999-9999" maxlength="16" autocomplete="tel">' +
'<label>Senha</label>' +
'<input type="password" id="senha" placeholder="Crie uma senha" maxlength="40" autocomplete="new-password">' +
'<label>Confirmar senha</label>' +
'<input type="password" id="confirmar" placeholder="Repita a senha" maxlength="40" autocomplete="new-password">' +
'<button id="btnEnviar" onclick="enviarCodigo()">Enviar codigo via WhatsApp</button>' +
'</div>' +

'<div id="step2" class="step hidden">' +
'<p style="text-align:center;color:#888;font-size:13px;margin-bottom:16px">Codigo enviado para seu WhatsApp</p>' +
'<input type="text" id="codigo" class="code-input" placeholder="000000" maxlength="6" autocomplete="off">' +
'<button id="btnVerificar" onclick="verificarCodigo()">Confirmar codigo</button>' +
'<button class="btn-back" onclick="voltar()">Voltar</button>' +
'</div>' +

'<div id="step3" class="step hidden">' +
'<div class="success-box">' +
'<h2>Teste concluido</h2>' +
'<p>Seu cadastro foi realizado com sucesso.</p>' +
'</div>' +
'</div>' +

'<div class="footer"><a href="/">voltar ao inicio</a></div>' +
'</div>' +

'<script>' +
'var dadosAtual = {};' +

'function alerta(msg, tipo) {' +
  'var el = document.getElementById("alertBox");' +
  'el.className = "alert alert-" + tipo;' +
  'el.textContent = msg;' +
  'el.style.display = "block";' +
  'setTimeout(function() { el.style.display = "none"; }, 4000);' +
'}' +

'function indicador(passo) {' +
  'for (var i = 1; i <= 3; i++) {' +
    'var el = document.getElementById("s" + i);' +
    'el.className = i === passo ? "active" : i < passo ? "done" : "";' +
  '}' +
'}' +

'async function enviarCodigo() {' +
  'var nome = document.getElementById("nome").value.trim();' +
  'var tel = document.getElementById("telefone").value.trim();' +
  'var senha = document.getElementById("senha").value;' +
  'var confirmar = document.getElementById("confirmar").value;' +
  'var btn = document.getElementById("btnEnviar");' +

  'if (!nome) { alerta("Informe seu nome", "error"); return; }' +
  'if (!tel || tel.replace(/\\D/g,"").length < 10) { alerta("Numero de WhatsApp invalido", "error"); return; }' +
  'if (senha.length < 4) { alerta("Senha deve ter no minimo 4 caracteres", "error"); return; }' +
  'if (senha !== confirmar) { alerta("Senhas nao conferem", "error"); return; }' +

  'btn.disabled = true;' +
  'btn.textContent = "Enviando...";' +

  'try {' +
    'var res = await fetch("' + AUTH_ROUTE_PREFIX + '/enviar-codigo", {' +
      'method: "POST",' +
      'headers: { "Content-Type": "application/json" },' +
      'body: JSON.stringify({ nome: nome, telefone: tel, senha: senha })' +
    '});' +
    'var data = await res.json();' +

    'if (!res.ok) {' +
      'alerta(data.error || "Erro ao enviar codigo", "error");' +
      'btn.disabled = false;' +
      'btn.textContent = "Enviar codigo via WhatsApp";' +
      'return;' +
    '}' +

    'dadosAtual = { nome: nome, telefone: tel };' +
    'document.getElementById("step1").classList.add("hidden");' +
    'document.getElementById("step2").classList.remove("hidden");' +
    'indicador(2);' +
    'document.getElementById("codigo").focus();' +
  '} catch (e) {' +
    'alerta("Erro de conexao", "error");' +
    'btn.disabled = false;' +
    'btn.textContent = "Enviar codigo via WhatsApp";' +
  '}' +
'}' +

'async function verificarCodigo() {' +
  'var input = document.getElementById("codigo");' +
  'var btn = document.getElementById("btnVerificar");' +
  'var cod = input.value.trim();' +

  'if (!cod || cod.length !== 6) {' +
    'alerta("Codigo deve ter 6 digitos", "error");' +
    'input.focus();' +
    'return;' +
  '}' +

  'btn.disabled = true;' +
  'btn.textContent = "Verificando...";' +

  'try {' +
    'var res = await fetch("' + AUTH_ROUTE_PREFIX + '/verificar-codigo", {' +
      'method: "POST",' +
      'headers: { "Content-Type": "application/json" },' +
      'body: JSON.stringify({ telefone: dadosAtual.telefone, codigo: cod })' +
    '});' +
    'var data = await res.json();' +

    'if (!res.ok) {' +
      'alerta(data.error || "Codigo invalido", "error");' +
      'btn.disabled = false;' +
      'btn.textContent = "Confirmar codigo";' +
      'return;' +
    '}' +

    'document.getElementById("step2").classList.add("hidden");' +
    'document.getElementById("step3").classList.remove("hidden");' +
    'indicador(3);' +
  '} catch (e) {' +
    'alerta("Erro de conexao", "error");' +
    'btn.disabled = false;' +
    'btn.textContent = "Confirmar codigo";' +
  '}' +
'}' +

'function voltar() {' +
  'document.getElementById("step2").classList.add("hidden");' +
  'document.getElementById("step1").classList.remove("hidden");' +
  'indicador(1);' +
  'document.getElementById("btnEnviar").disabled = false;' +
  'document.getElementById("btnEnviar").textContent = "Enviar codigo via WhatsApp";' +
'}' +

'document.getElementById("codigo").addEventListener("input", function() {' +
  'this.value = this.value.replace(/\\D/g,"").slice(0,6);' +
'});' +

'function mascaraTelefone(value) {' +
  'var d = value.replace(/\\D/g,"").slice(0,11);' +
  'if (d.length <= 2) return "(" + d;' +
  'if (d.length <= 7) return "(" + d.slice(0,2) + ") " + d.slice(2);' +
  'return "(" + d.slice(0,2) + ") " + d.slice(2,7) + "-" + d.slice(7);' +
'}' +

'document.getElementById("telefone").addEventListener("input", function() {' +
  'var cursor = this.selectionStart;' +
  'var prevLen = this.value.length;' +
  'this.value = mascaraTelefone(this.value);' +
  'if (cursor === prevLen) {' +
    'this.setSelectionRange(this.value.length, this.value.length);' +
  '}' +
'});' +

'document.getElementById("telefone").addEventListener("keydown", function(e) {' +
  'if (e.key === "Enter") enviarCodigo();' +
'});' +

'document.getElementById("codigo").addEventListener("keydown", function(e) {' +
  'if (e.key === "Enter") verificarCodigo();' +
'});' +

'</script>' +
'</body>' +
'</html>';
}

module.exports = function registerAuthEndpoints(app, deps) {
    app.get(`${AUTH_ROUTE_PREFIX}/login`, (_req, res) => {
        res.send(renderLoginPage());
    });

    app.post(`${AUTH_ROUTE_PREFIX}/enviar-codigo`, async (req, res) => {
        const { nome, telefone, senha } = req.body;
        if (!telefone) {
            return res.status(400).json({ error: 'Telefone obrigatorio' });
        }

        const phone = normalizePhone(telefone);
        if (phone.length < 10 || phone.length > 15) {
            return res.status(400).json({ error: 'Numero de telefone invalido' });
        }

        const code = generateCode();

        codeStore.set(phone, {
            nome: nome || 'nao informado',
            senha: senha || '',
            code,
            expiresAt: Date.now() + CODE_EXPIRY_MS,
            verified: false
        });

        try {
            await deps.sendToPhone(`Seu codigo de confirmacao do Academy Conexos: ${code}`, phone);
            console.log(`[AUTH] Codigo enviado para ${phone}`);
            res.json({ success: true, message: 'Codigo enviado via WhatsApp' });
        } catch (error) {
            codeStore.delete(phone);
            console.error(`[AUTH] Erro ao enviar codigo para ${phone}:`, error && error.message ? error.message : error);
            res.status(500).json({ error: 'Erro ao enviar codigo. Verifique se o bot esta conectado.' });
        }
    });

    app.post(`${AUTH_ROUTE_PREFIX}/verificar-codigo`, (req, res) => {
        const { telefone, codigo } = req.body;
        if (!telefone || !codigo) {
            return res.status(400).json({ error: 'Telefone e codigo obrigatorios' });
        }

        const phone = normalizePhone(telefone);
        const stored = codeStore.get(phone);

        if (!stored) {
            return res.status(400).json({ error: 'Nenhum codigo enviado para este telefone' });
        }

        if (stored.expiresAt < Date.now()) {
            codeStore.delete(phone);
            return res.status(400).json({ error: 'Codigo expirado. Solicite um novo.' });
        }

        if (stored.code !== String(codigo).trim()) {
            return res.status(400).json({ error: 'Codigo invalido' });
        }

        stored.verified = true;
        console.log(`[AUTH] Cadastro concluido: ${stored.nome} / ${phone}`);

        res.json({ success: true, message: 'Teste concluido' });
    });

    return {
        registeredRoutes: [
            'GET /auth/login',
            'POST /auth/enviar-codigo',
            'POST /auth/verificar-codigo'
        ]
    };
};
