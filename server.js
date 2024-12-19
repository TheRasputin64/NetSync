const WebSocket = require('ws');
const crypto = require('crypto');
const http = require('http');

// Create HTTP server
const server = http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Server is running');
});

// Create WebSocket server on top of the HTTP server
const wss = new WebSocket.Server({ server });

// Map to store rooms and connected clients
const rooms = new Map();

// Function to generate a random room code
function generateRoomCode() {
    return crypto.randomBytes(3).toString('hex');
}

// Function to get a list of connected users in a room
function getConnectedUsers(room) {
    return Array.from(room.clients).map(client => client.username);
}

// WebSocket connection event
wss.on('connection', (ws) => {
    let roomCode = null;
    let username = null;

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        switch (data.type) {
            case 'create':
                roomCode = generateRoomCode();
                username = data.username;
                ws.username = username;
                rooms.set(roomCode, { host: ws, clients: new Set([ws]), filename: null, state: { playing: false, time: 0 } });
                ws.send(JSON.stringify({ type: 'created', roomCode }));
                break;
            case 'join':
                roomCode = data.roomCode;
                username = data.username;
                ws.username = username;
                const room = rooms.get(roomCode);
                if (room) {
                    room.clients.add(ws);
                    broadcastToRoom(roomCode, { type: 'userList', users: getConnectedUsers(room) });
                    ws.send(JSON.stringify({ type: 'joined', filename: room.filename, state: room.state }));
                }
                break;
            case 'videoSelected':
                if (rooms.has(roomCode)) {
                    const room = rooms.get(roomCode);
                    room.filename = data.filename;
                    broadcastToRoom(roomCode, { type: 'videoUpdate', filename: data.filename }, ws);
                }
                break;
            case 'videoControl':
                if (rooms.has(roomCode)) {
                    const room = rooms.get(roomCode);
                    room.state = { playing: data.action === 'play', time: data.time };
                    broadcastToRoom(roomCode, { type: 'videoControl', action: data.action, time: data.time }, ws);
                }
                break;
        }
    });

    // WebSocket close event
    ws.on('close', () => {
        if (roomCode && rooms.has(roomCode)) {
            const room = rooms.get(roomCode);
            room.clients.delete(ws);
            if (room.clients.size === 0) {
                rooms.delete(roomCode);
            } else if (room.host === ws) {
                rooms.delete(roomCode);
                broadcastToRoom(roomCode, { type: 'hostLeft' });
            } else {
                broadcastToRoom(roomCode, { type: 'userList', users: getConnectedUsers(room) });
            }
        }
    });
});

// Function to broadcast messages to all clients in the room except the sender
function broadcastToRoom(roomCode, message, exclude = null) {
    const room = rooms.get(roomCode);
    if (room) {
        room.clients.forEach((client) => {
            if (client !== exclude) {
                client.send(JSON.stringify(message));
            }
        });
    }
}

// Start HTTP server listening on port 3000
server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
