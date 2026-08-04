let activeSocket = null;
let connectionStatus = 'disconnected';
let connectResolve = null;
let connectPromise = null;

function setActiveSocket(sock) {
    activeSocket = sock;
}

function getActiveSocket() {
    return activeSocket;
}

function isSocketConnected() {
    return activeSocket !== null && connectionStatus === 'connected';
}

function setConnecting() {
    connectionStatus = 'connecting';
    if (!connectPromise) {
        connectPromise = new Promise((resolve) => {
            connectResolve = resolve;
        });
    }
}

function setConnected() {
    connectionStatus = 'connected';
    if (connectResolve) {
        connectResolve();
        connectPromise = null;
        connectResolve = null;
    }
}

function setDisconnected() {
    connectionStatus = 'disconnected';
    connectPromise = null;
    connectResolve = null;
}

async function waitForConnection(timeoutMs) {
    if (connectionStatus === 'connected') {
        return;
    }

    const timer = timeoutMs || 15000;

    if (!connectPromise) {
        connectPromise = new Promise((resolve) => {
            connectResolve = resolve;
        });
    }

    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout aguardando conexao do WhatsApp')), timer)
    );

    await Promise.race([connectPromise, timeout]);
}

module.exports = {
    setActiveSocket,
    getActiveSocket,
    isSocketConnected,
    setConnecting,
    setConnected,
    setDisconnected,
    waitForConnection
};
