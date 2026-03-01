// Add these to tracking inside your server.js
const players = {}; 
const playerRoles = {}; // Tracks socket.id -> "player", "admin", "owner"
const frozenPlayers = {};

io.on('connection', (socket) => {
    playerRoles[socket.id] = "player"; // default

    socket.on('setRole', (role) => {
        if(role === "admin" || role === "owner") {
            playerRoles[socket.id] = role;
        }
    });

    socket.on('joinGame', (playerData) => {
        const isNameTaken = Object.values(players).some((p) => p.name.toLowerCase() === playerData.name.toLowerCase());
        if (isNameTaken) {
            socket.emit('joinError', "That name is already taken!");
            return; 
        }

        players[socket.id] = { id: socket.id, name: playerData.name, x: 0, y: 1.7, z: 0 };
        socket.emit('joinSuccess');
        socket.emit('currentPlayers', players);
        socket.broadcast.emit('newPlayer', players[socket.id]);
    });

    socket.on('adminCommand', (data) => {
        const senderRole = playerRoles[socket.id];
        if (senderRole !== "admin" && senderRole !== "owner") return; // Unauthorized

        const targetSocket = io.sockets.sockets.get(data.targetId);
        const targetRole = playerRoles[data.targetId];

        // The Ultimate Rule: Admins cannot affect Owners
        if (senderRole === "admin" && targetRole === "owner") return; 

        if (data.action === 'nuke') {
            io.emit('nuked');
        } 
        else if (data.action === 'kick' || data.action === 'ban') {
            if (targetSocket) {
                targetSocket.emit('kicked');
                targetSocket.disconnect();
            }
        } 
        else if (data.action === 'jail') {
            if (targetSocket) {
                targetSocket.emit('forceTeleport', { x: 0, y: 505, z: 0 }); // Inside the physical jail
            }
        }
        else if (data.action === 'freeze') {
            if (targetSocket) {
                frozenPlayers[data.targetId] = !frozenPlayers[data.targetId]; // Toggle freeze
                targetSocket.emit('frozen', frozenPlayers[data.targetId]);
            }
        }
        else if (data.action === 'tp') {
            if (players[data.targetId]) {
                socket.emit('forceTeleport', { x: players[data.targetId].x, y: players[data.targetId].y + 2, z: players[data.targetId].z });
            }
        }
        else if (data.action === 'bring') {
            if (targetSocket && players[socket.id]) {
                targetSocket.emit('forceTeleport', { x: players[socket.id].x, y: players[socket.id].y + 2, z: players[socket.id].z });
            }
        }
        else if (data.action === 'givePower') {
            if (targetSocket) {
                targetSocket.emit('setElement', data.value); // Forces them to switch elements
            }
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        delete playerRoles[socket.id];
        delete frozenPlayers[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});
