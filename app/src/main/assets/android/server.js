const express = require('express');
const http = require('http'); 
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app); 
const io = new Server(server, { cors: { origin: "*" } });

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join', (role) => {
        socket.join(role); 
    });

    socket.on('signal', (data) => {
        // Sends the signal to the specific target (either the 'admin' room OR a specific socket.id)
        socket.to(data.to).emit('signal', {
            from: socket.id,
            signal: data.signal
        });
    });
});

const port = process.env.PORT || 3000;
server.listen(port, '0.0.0.0', () => console.log(`Signaling server running on port ${port}`));