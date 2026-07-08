// Gerencia a conexão ativa do WhatsApp
let activeSocket = null;

function setActiveSocket(sock) {
    activeSocket = sock;
}

function getActiveSocket() {
    return activeSocket;
}

function isSocketConnected() {
    return activeSocket !== null;
}

module.exports = {
    setActiveSocket,
    getActiveSocket,
    isSocketConnected
};
