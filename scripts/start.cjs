const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

function tryPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, '127.0.0.1');
    server.on('listening', () => {
      server.close(() => resolve(true));
    });
    server.on('error', () => resolve(false));
  });
}

function findFreePort(startPort) {
  return tryPort(startPort).then((free) => {
    if (free) return startPort;
    let port = startPort + 1;
    return findFreePort(port);
  });
}

const targetPort = 3001;
findFreePort(targetPort).then((port) => {
  console.log(`Starting on port ${port}`);
  const child = spawn('npx', ['next', 'start', '-p', String(port)], {
    stdio: 'inherit',
    shell: true,
    cwd: path.resolve(__dirname, '..'),
  });
  child.on('error', (err) => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
});
