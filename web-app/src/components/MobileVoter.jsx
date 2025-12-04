import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

// Conectar automáticamente a la misma IP desde la que se cargó la página
const socket = io(`http://${window.location.hostname}:3001`);

const MobileVoter = () => {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [voteState, setVoteState] = useState({ isActive: false, options: [] });
  const [myVote, setMyVote] = useState(null);
  
  // ESTADOS PARA EL FUTURO (INVENTARIO)
  const [activeTab, setActiveTab] = useState('voto'); // 'voto' o 'mochila'
  const [inventory, setInventory] = useState([]); // Lista de objetos (ej: ['panfleto1.jpg'])
  const [hasNewItem, setHasNewItem] = useState(false); // Para notificar

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('sync_state', (state) => setVoteState(state));

    socket.on('vote_started', (options) => {
      setVoteState({ isActive: true, options });
      setMyVote(null);
      setActiveTab('voto'); // Forzar vista de voto cuando empieza
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    });

    socket.on('vote_ended', () => {
      setVoteState({ isActive: false, options: [] });
      setMyVote(null);
    });

    // TODO: AQUI ESCUCHAREMOS EL EVENTO DE INVENTARIO EN EL FUTURO
    // socket.on('receive_item', (item) => { ... })

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

  // PANTALLA DE CARGA
  if (!isConnected) return <div className="h-screen bg-black text-red-500 flex items-center justify-center font-mono">🔌 Conectando...</div>;

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      
      {/* CABECERA (CARNET DE ESTUDIANTE) */}
      <div className="bg-gray-800 p-4 border-b border-gray-700 flex justify-between items-center shadow-md z-10">
        <div>
            <h1 className="text-white font-bold uppercase tracking-wider text-sm">Facultade de Ciencias</h1>
            <p className="text-yellow-500 text-xs font-mono">CARNET DE ESTUDANTE - 1968</p>
        </div>
        <div className="w-10 h-10 bg-gray-700 rounded-full border-2 border-gray-600 flex items-center justify-center text-xl">
            🎓
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL (CON SCROLL) */}
      <div className="flex-1 overflow-y-auto p-6 pb-24">
        
        {/* PESTAÑA VOTO */}
        {activeTab === 'voto' && (
            <>
                {voteState.isActive ? (
                    <div className="flex flex-col gap-4 animate-fade-in">
                        <h2 className="text-white text-center mb-4 uppercase tracking-widest font-bold">¡Vota ahora!</h2>
                        {voteState.options.map((option, index) => {
                            const isSelected = myVote === index;
                            return (
                                <button key={index} onClick={() => handleVote(index)}
                                    className={`w-full py-6 px-4 rounded-xl text-lg font-bold uppercase shadow-lg transition-all transform active:scale-95 ${isSelected ? 'bg-yellow-500 text-black border-4 border-white' : 'bg-gray-800 text-yellow-500 border-2 border-yellow-500'}`}>
                                    {option}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-yellow-500 opacity-50">
                        <div className="text-6xl mb-4 animate-pulse">👁️</div>
                        <p className="text-center font-mono text-sm uppercase">Atento a la proyección</p>
                    </div>
                )}
            </>
        )}

        {/* PESTAÑA MOCHILA (FUTURO) */}
        {activeTab === 'mochila' && (
            <div className="text-white">
                <h2 className="text-xl font-bold mb-6 border-b border-gray-700 pb-2">🎒 Mochila</h2>
                {inventory.length === 0 ? (
                    <p className="text-gray-500 text-center mt-10 italic">Aínda non tes documentos.</p>
                ) : (
                    <div className="grid grid-cols-2 gap-4">
                        {/* Aquí renderizaremos los items */}
                    </div>
                )}
            </div>
        )}
      </div>

      {/* BARRA DE NAVEGACIÓN INFERIOR */}
      <div className="fixed bottom-0 w-full bg-gray-800 border-t border-gray-700 flex text-gray-400 font-bold text-xs uppercase z-20">
          <button 
            onClick={() => setActiveTab('voto')}
            className={`flex-1 py-4 flex flex-col items-center gap-1 ${activeTab === 'voto' ? 'text-yellow-500 bg-gray-700' : ''}`}
          >
              <span className="text-xl">🗳️</span>
              Decisión
          </button>
          
          <button 
            onClick={() => { setActiveTab('mochila'); setHasNewItem(false); }}
            className={`flex-1 py-4 flex flex-col items-center gap-1 relative ${activeTab === 'mochila' ? 'text-yellow-500 bg-gray-700' : ''}`}
          >
              <span className="text-xl">🎒</span>
              Documentos
              {hasNewItem && <span className="absolute top-3 right-10 w-3 h-3 bg-red-500 rounded-full animate-bounce"></span>}
          </button>
      </div>

    </div>
  );
};

export default MobileVoter;