const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// This line tells the server to host your index.html file and any assets!
app.use(express.static(__dirname));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// This opens the WebSockets for multiplayer
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

const players = {}; 
const takenNames = ["admin", "guest", "test"];
const badWords = ["badword1", "swearword", "curseword", "crap", "heck"];

io.on('connection', (socket) => {
  console.log('A new player connected! ID:', socket.id);

  socket.on('joinGame', (data) => {
    const name = data.name.trim();
    const lowerName = name.toLowerCase();

    if (name === "" || /\d/.test(name) || badWords.some(w => lowerName.includes(w)) || takenNames.includes(lowerName)) {
       socket.emit('joinError', 'Invalid name. No numbers or bad words allowed.');
       return;
    }
    
    const isNameTaken = Object.values(players).some(p => p.name.toLowerCase() === lowerName);
    if (isNameTaken) {
       socket.emit('joinError', 'That name is currently playing right now!');
       return;
    }

    players[socket.id] = {
      id: socket.id,
      name: name,
      element: data.element,
      x: 0, y: 1.7, z: 0,
      yaw: 0,
      hp: 100
    };

    socket.emit('joinSuccess', players[socket.id]);
    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', players[socket.id]);
    console.log(`${name} joined the arena!`);
  });

  socket.on('move', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].z = data.z;
      players[socket.id].yaw = data.yaw;
      socket.broadcast.emit('playerMoved', players[socket.id]);
    }
  });

  socket.on('disconnect', () => {
    if (players[socket.id]) {
      console.log(`${players[socket.id].name} left the arena.`);
      delete players[socket.id];
      io.emit('playerDisconnected', socket.id); 
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Elemental Server is running on port ${PORT}`);
});
