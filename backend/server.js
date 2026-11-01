const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer();
const io = new Server(server, { cors: { origin: '*' } });

// Only players whose Phaser scene is fully ready live in this object.
const players = {};

const DEFAULT_SPAWN = { x: 200, y: 200 }; // matches the local spawn in main.js

const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // The client calls this when its Phaser scene is ready (and again after a reconnect).
  // It is idempotent: calling it twice never creates duplicates.
  socket.on('getPlayers', (spawn = {}) => {
    const alreadyJoined = !!players[socket.id];

    if (!alreadyJoined) {
      players[socket.id] = {
        id: socket.id,
        x: num(spawn.x, DEFAULT_SPAWN.x),
        y: num(spawn.y, DEFAULT_SPAWN.y),
        name: String(spawn.name || '').trim().slice(0, 16) || 'Player',
        anim: 'idle-down'
      };
    }

    console.log('Sending players to:', socket.id);

    // 1) Snapshot for the player who just became ready
    socket.emit('currentPlayers', players);

    // 2) Announce to everyone else, but only the first time
    if (!alreadyJoined) {
      socket.broadcast.emit('newPlayer', players[socket.id]);
    }
  });

  socket.on('playerMovement', (data) => {
    const p = players[socket.id];
    if (!p || !data) return; //ignore anyone who hasn't joined yet

    p.x = num(data.x, p.x);
    p.y = num(data.y, p.y);
    p.anim = typeof data.anim === 'string' ? data.anim : p.anim;

    socket.broadcast.emit('playerMoved', p);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    //if played already joined -> anounce to everyone else that he left
    if (players[socket.id]) {
      delete players[socket.id];
      io.emit('playerDisconnected', socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));