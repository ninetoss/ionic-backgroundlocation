const express = require('express');
const http = require('http'); // Must be http, not https
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app); 
const io = new Server(server, { cors: { origin: "*" } });

// ... (your socket.on logic here)

// Explicitly bind to localhost (127.0.0.1) to match the .htaccess rule
server.listen(3000, '127.0.0.1', () => console.log('Signaling server running internally'));