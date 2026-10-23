const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } // Allows your frontend to connect
});

// Store players in memory (for MVP)
const players = {};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // 1. When a player joins, give them a starting position and a random color
  players[socket.id] = {
    id: socket.id,
    x: 400,
    y: 300,
    color: Math.floor(Math.random() * 0xffffff) // Random color for the avatar
  };

  // Send the current list of players to the NEW player
  socket.emit('currentPlayers', players);

  // Tell everyone else that a new player joined
  socket.broadcast.emit('newPlayer', players[socket.id]);

  // 2. Listen for movement from this player
  socket.on('playerMovement', (movementData) => {
    if (players[socket.id]) {
      players[socket.id].x = movementData.x;
      players[socket.id].y = movementData.y;
      
      // Broadcast the movement to everyone else
      socket.broadcast.emit('playerMoved', players[socket.id]);
    }
  });

  // 3. Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

server.listen(3000, () => {
  console.log('Server listening on port 3000');
});