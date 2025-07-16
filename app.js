const http = require('http');
const os = require('os');
console.log("Starting web server...");
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end(`Hello from Kubernetes! I'm running on host: ${os.hostname()}
     \n`);
});
server.listen(8080);