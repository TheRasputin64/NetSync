const WebSocket = require('ws');
const crypto = require('crypto');
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Server is running');
});

const wss = new WebSocket.Server({ 
    server,
    perMessageDeflate: {
        zlibDeflateOptions: { level: 9 }
    }
});

const rooms = new Map();

function generateRoomCode() {
    return crypto.randomBytes(3).toString('hex');
}

function getConnectedUsers(room) {
    return Array.from(room.clients).map(client => client.username);
}

wss.on('connection', (ws) => {
    let roomCode = null;
    let username = null;
    ws.binaryType = 'arraybuffer';

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        switch(data.type) {
            case 'create':
                roomCode = generateRoomCode();
                username = data.username;
                ws.username = username;
                
                rooms.set(roomCode, {
                    host: ws,
                    clients: new Set([ws]),
                    filename: null,
                    state: {
                        playing: false,
                        time: 0
                    },
                    lastUpdate: Date.now()
                });
                
                ws.send(JSON.stringify({
                    type: 'created',
                    roomCode: roomCode
                }));
                break;

            case 'join':
                roomCode = data.roomCode;
                username = data.username;
                ws.username = username;
                
                const room = rooms.get(roomCode);
                if (room) {
                    room.clients.add(ws);
                    const users = getConnectedUsers(room);
                    room.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                type: 'userList',
                                users: users
                            }));
                        }
                    });
                    
                    ws.send(JSON.stringify({
                        type: 'joined',
                        filename: room.filename,
                        state: room.state
                    }));
                }
                break;

            case 'videoSelected':
                if (rooms.has(roomCode)) {
                    const videoRoom = rooms.get(roomCode);
                    videoRoom.filename = data.filename;
                    videoRoom.clients.forEach(client => {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                type: 'videoUpdate',
                                filename: data.filename
                            }));
                        }
                    });
                }
                break;

            case 'videoControl':
                if (rooms.has(roomCode)) {
                    const controlRoom = rooms.get(roomCode);
                    const now = Date.now();
                    
                    // Update room state
                    controlRoom.state = {
                        playing: data.action === 'play' ? true : data.action === 'pause' ? false : controlRoom.state.playing,
                        time: Math.round(data.time * 10) / 10
                    };
                    
                    // Only throttle regular updates, not play/pause actions
                    if (data.action === 'play' || data.action === 'pause' || now - controlRoom.lastUpdate > 100) {
                        controlRoom.lastUpdate = now;
                        
                        // Send the current state to all clients
                        controlRoom.clients.forEach(client => {
                            if (client !== ws && client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({
                                    type: 'videoControl',
                                    action: data.action,
                                    time: controlRoom.state.time,
                                    playing: controlRoom.state.playing
                                }));
                            }
                        });
                    }
                }
                break;
        }
    });

    ws.on('close', () => {
        if (roomCode && rooms.has(roomCode)) {
            const room = rooms.get(roomCode);
            room.clients.delete(ws);
            
            if (room.clients.size === 0) {
                rooms.delete(roomCode);
            } else if (room.host === ws) {
                room.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'hostLeft'
                        }));
                    }
                });
                rooms.delete(roomCode);
            } else {
                const users = getConnectedUsers(room);
                room.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'userList',
                            users: users
                        }));
                    }
                });
            }
        }
    });
});

server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});