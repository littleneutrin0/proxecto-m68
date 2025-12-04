import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

// IMPORTANTE: Si vas a probar con tu móvil real, cambia 'localhost' por la IP de tu PC.
// Ejemplo: const socket = io('http://192.168.1.35:3001');
const socket = io('http://localhost:3001');

const MobileVoter = () => {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [voteState, setVoteState] = useState({ isActive: false, options: [] });
  const [myVote, setMyVote] = useState(null); // Índice de lo que voté (0, 1...)

  useEffect(() => {
    // Conexión
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    // Sincronización inicial
    socket.on('sync_state', (state) => {
      setVoteState(state);
    });

    // Empieza una votación
    socket.on('vote_started', (options) => {
      setVoteState({ isActive: true, options });
      setMyVote(null); // Resetear voto anterior
      // Vibración en el móvil para avisar (si el navegador lo soporta)
      if (navigator.vibrate) navigator.vibrate(200);
    });

    // Termina la votación
    socket.on('vote_ended', () => {
      setVoteState({ isActive: false, options: [] });
      setMyVote(null);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('sync_state');
      socket.off('vote_started');
      socket.off('vote_ended');
    };
  }, []);

  const handleVote = (index) => {
    setMyVote(index);
    socket.emit('mobile_cast_vote', index);
    if (navigator.vibrate) navigator.vibrate(50);
  };

  // --- PANTALLA DE CARGA / DESCONECTADO ---
  if (!isConnected) {
    return (
      <div className="h-screen bg-black text-red-500 flex flex-col items-center justify-center p-4 text-center font-mono">
        <div className="text-4xl mb-4">🔌</div>
        <h1 className="text-xl font-bold">Desconectado</h1>
        <p className="text-sm mt-2">Intentando conectar con el servidor...</p>
      </div>
    );
  }

  // --- PANTALLA DE ESPERA (NO HAY VOTACIÓN) ---
  if (!voteState.isActive) {
    return (
      <div className="h-screen bg-black text-yellow-500 flex flex-col items-center justify-center p-6 text-center font-mono animate-pulse">
        <div className="text-6xl mb-6">👁️</div>
        <h1 className="text-2xl font-bold uppercase tracking-widest mb-2">Atento a la pantalla</h1>
        <p className="text-gray-400">La decisión llegará pronto...</p>
      </div>
    );
  }

  // --- PANTALLA DE VOTACIÓN (BOTONES) ---
  return (
    <div className="min-h-screen bg-gray-900 p-6 flex flex-col justify-center">
      <h1 className="text-white text-center mb-8 uppercase tracking-widest font-bold text-xl">
        Elige tu camino
      </h1>
      
      <div className="flex flex-col gap-4">
        {voteState.options.map((option, index) => {
          const isSelected = myVote === index;
          return (
            <button
              key={index}
              onClick={() => handleVote(index)}
              className={`
                w-full py-8 px-4 rounded-xl text-xl font-bold uppercase shadow-lg transition-all transform active:scale-95
                ${isSelected 
                  ? 'bg-yellow-500 text-black border-4 border-white scale-105' 
                  : 'bg-gray-800 text-yellow-500 border-2 border-yellow-500 hover:bg-gray-700'
                }
              `}
            >
              {option}
              {isSelected && <span className="block text-xs mt-1 font-normal">(Voto enviado)</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MobileVoter;