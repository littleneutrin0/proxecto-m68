import React, { useState, useEffect, useMemo } from 'react';
import historiaData from '../data/historia.json';

// --- PARSER ---
const parseScript = (rawText) => {
  if (!rawText) return [];
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  return lines.map(line => {
    const match = line.match(/^([A-ZÁÉÍÓÚÑa-záéíóúñ]+):(.+)/);
    if (match) {
      return { speaker: match[1].trim(), text: match[2].trim() };
    } else {
      return { speaker: null, text: line };
    }
  });
};

const GameEngine = () => {
  const [currentSceneId, setCurrentSceneId] = useState("1. INT. AULA. FACULTADE DE CIENCIAS - DÍA");
  const [gameState, setGameState] = useState({});
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [areChoicesVisible, setAreChoicesVisible] = useState(false);

  const currentScene = historiaData[currentSceneId];

  const script = useMemo(() => {
    return currentScene ? parseScript(currentScene.text) : [];
  }, [currentScene]);

  useEffect(() => {
    setDialogueIndex(0);
    setAreChoicesVisible(false);
  }, [currentSceneId]);

  if (!currentScene) return <div className="p-10 text-white">ERROR: Escena no encontrada</div>;

  const handleScreenClick = () => {
    if (areChoicesVisible) return;

    if (dialogueIndex < script.length - 1) {
      setDialogueIndex(prev => prev + 1);
    } 
    else if (currentScene.choices.length > 0) {
      setAreChoicesVisible(true);
    }
  };

  const handleChoice = (choice) => {
    if (choice.state_change) {
      setGameState(prev => ({ ...prev, [choice.state_change.variable]: choice.state_change.value }));
    }
    if (choice.target) {
      setCurrentSceneId(choice.target);
    }
  };

  const currentLine = script[dialogueIndex] || { speaker: null, text: "..." };
  const isLastLine = dialogueIndex === script.length - 1;

  return (
    <div 
      className="relative w-full h-screen bg-black overflow-hidden font-sans select-none cursor-pointer"
      onClick={handleScreenClick}
    >
      
      {/* CAPA 1: FONDO */}
      <div className="absolute inset-0 z-0">
        {currentScene.media.IMG ? (
          <img src={`/img/fondos/${currentScene.media.IMG}.jpg`} alt="BG" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gray-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/20" />
      </div>

      {/* CAPA 2: PERSONAJES */}
      <div className="absolute bottom-0 left-0 right-0 z-10 h-full pointer-events-none flex justify-center items-end pb-0">
        {currentScene.media.CHARS && currentScene.media.CHARS.map((charName, index) => (
            <img key={index} src={`/img/personajes/${charName}.png`} alt={charName} className="max-h-[90vh] w-auto object-contain drop-shadow-2xl" />
        ))}
      </div>

      {/* CAPA 3: MODAL DE DECISIONES (CAMBIO IMPORTANTE: Z-INDEX 50) */}
      {/* Ahora esta capa está POR ENCIMA del texto cuando aparece */}
      {areChoicesVisible && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center animate-fade-in pb-10">
           <h2 className="text-white/90 text-xl mb-8 uppercase tracking-[0.3em] font-bold animate-pulse">
               Toma una decisión
           </h2>
           <div className="flex flex-col gap-6 w-full max-w-3xl px-4">
             {currentScene.choices.map((choice, index) => (
               <button
                 key={index}
                 onClick={(e) => { e.stopPropagation(); handleChoice(choice); }}
                 className="
                    w-full py-6 px-8 
                    bg-gray-900 border-l-8 border-yellow-500 
                    text-yellow-500 text-2xl md:text-3xl font-bold uppercase text-left
                    hover:bg-yellow-500 hover:text-black hover:scale-105 hover:shadow-[0_0_30px_rgba(234,179,8,0.6)]
                    transition-all duration-300 shadow-2xl cursor-pointer
                 "
               >
                 {choice.label}
               </button>
             ))}
           </div>
        </div>
      )}

      {/* CAPA 4: CAJA DE DIÁLOGO */}
      {/* CAMBIO IMPORTANTE: Si hay opciones visibles, esto se vuelve transparente y NO CLICABLE (pointer-events-none) */}
      <div 
        className={`
            absolute bottom-0 w-full p-4 md:p-10 transition-all duration-700
            ${areChoicesVisible ? 'z-0 opacity-0 pointer-events-none translate-y-10' : 'z-40 opacity-100'}
        `}
      >
        <div className="w-full max-w-7xl mx-auto">
            
            {currentLine.speaker && (
                <div className="inline-block bg-yellow-600 text-black font-black text-xl md:text-2xl px-6 py-2 uppercase tracking-wider transform -skew-x-12 mb-2 ml-4 shadow-lg border-2 border-white/20">
                    {currentLine.speaker}
                </div>
            )}

            <div className="bg-black/90 border-2 border-gray-600 rounded-2xl p-8 md:p-10 shadow-2xl relative min-h-[200px] flex items-center">
                <p className="text-white text-2xl md:text-4xl font-medium leading-relaxed drop-shadow-md">
                  {currentLine.text}
                </p>

                {!isLastLine && (
                    <div className="absolute bottom-4 right-6 animate-bounce text-yellow-500 text-3xl">▼</div>
                )}
                
                {isLastLine && !areChoicesVisible && currentScene.choices.length > 0 && (
                    <div className="absolute bottom-4 right-6 animate-pulse text-yellow-500 text-4xl">▶</div>
                )}
            </div>
        </div>
      </div>

    </div>
  );
};

export default GameEngine;