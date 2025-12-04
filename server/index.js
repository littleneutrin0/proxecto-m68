const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Permite conexiones desde cualquier móvil/PC
    methods: ["GET", "POST"]
  }
});

// Estado de la votación
let votingState = {
  isActive: false,
  options: [], // Ej: ["Ir al bar", "Ir a casa"]
  votes: {}    // { "socketId_del_movil": 0 } (0 es la opción A, 1 la B)
};

io.on('connection', (socket) => {
  console.log('📱 Alguien se conectó:', socket.id);

  // Al conectarse, decirle si hay votación en curso
  socket.emit('sync_state', { 
    isActive: votingState.isActive, 
    options: votingState.options 
  });

  // --- EVENTOS QUE RECIBE DE LA PANTALLA PRINCIPAL (TU PC) ---
  socket.on('host_start_vote', (options) => {
    votingState = {
      isActive: true,
      options: options,
      votes: {}
    };
    console.log('🗳️ Votación iniciada:', options);
    // Avisar a todos los móviles
    io.emit('vote_started', options);
  });

  socket.on('host_end_vote', () => {
    votingState.isActive = false;
    io.emit('vote_ended');
  });

  // --- EVENTOS QUE RECIBE DE LOS MÓVILES ---
  socket.on('mobile_cast_vote', (optionIndex) => {
    if (!votingState.isActive) return;

    // Guardar el voto (sobrescribe si ya votó, así pueden cambiar de opinión)
    votingState.votes[socket.id] = optionIndex;

    // Calcular totales
    const totals = new Array(votingState.options.length).fill(0);
    Object.values(votingState.votes).forEach(voteIndex => {
      if (totals[voteIndex] !== undefined) totals[voteIndex]++;
    });

    // Enviar actualización EN VIVO a la pantalla principal
    io.emit('update_results', totals);
  });
});

server.listen(3001, () => {
  console.log('🚀 Servidor de Votación listo en puerto 3001');
});