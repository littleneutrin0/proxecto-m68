import React, { useState, useEffect, useMemo, useCallback } from 'react';
import historiaData from '../data/historia.json';

// --- FUNCIÓN DE PARSEO DE DIÁLOGO ---
const processLine = (line) => {
    if (!line) return { speaker: null, text: '', commands: [], conditional: null };

    const commandRegex = /\{\{(SCENE_START|SHOW|HIDE|IA_CONTEXT|IA_PROMPT|IF|ELSE|ENDIF):\s*(.+?)\}\}/g;
    const speakerRegex = /^([A-ZÁÉÍÓÚÑ a-záéíóúñ]+):(.+)/;
    
    let commands = [];
    let conditional = null;
    let text = line;
    
    // 1. Extraer comandos y guardarlos
    const foundCommands = [...line.matchAll(commandRegex)];
    foundCommands.forEach(match => {
        const type = match[1]; 
        const args = match[2] ? match[2].trim() : '';
        
        // Manejar condicionales especialmente
        if (type === 'IF') {
            const [variable, value] = args.split('=');
            conditional = { type: 'IF', variable, value };
        } else if (type === 'ELSE') {
            conditional = { type: 'ELSE' };
        } else if (type === 'ENDIF') {
            conditional = { type: 'ENDIF' };
        } else {
            commands.push({ type, args });
        }
    });

    // 2. Eliminar comandos del texto visible
    text = text.replace(commandRegex, '').trim();

    // 3. Separar Speaker
    const speakerMatch = text.match(speakerRegex);
    
    if (speakerMatch) {
      return { speaker: speakerMatch[1].trim(), text: speakerMatch[2].trim(), commands, conditional };
    } else {
      return { speaker: null, text: text, commands, conditional };
    }
};

const parseScript = (rawText, gameState = {}) => {
    if (!rawText) return [];
    
    const lines = rawText.split('[DIALOGUE_BREAK]').map(l => l.trim()).filter(l => l.length > 0);
    const parsed = lines.map(processLine);
    
    // Filtrar líneas según condicionales
    const filtered = [];
    let skipMode = false;
    let insideIf = false;
    
    for (let i = 0; i < parsed.length; i++) {
        const line = parsed[i];
        
        if (line.conditional?.type === 'IF') {
            insideIf = true;
            const variable = line.conditional.variable.trim();
            const expectedValue = line.conditional.value.trim();
            const actualValue = String(gameState[variable] || '').trim();
            
            // DEBUG - Comentar después de verificar
            console.log('🔍 IF Condition:', {
                variable,
                expectedValue,
                actualValue,
                match: actualValue === expectedValue
            });
            
            // Si NO coincide, saltamos el bloque IF
            skipMode = (actualValue !== expectedValue);
            continue;
        }
        
        if (line.conditional?.type === 'ELSE') {
            // Invertir: si estábamos saltando el IF, ahora mostramos el ELSE
            skipMode = !skipMode;
            console.log('🔄 ELSE triggered, skipMode:', skipMode);
            continue;
        }
        
        if (line.conditional?.type === 'ENDIF') {
            console.log('✅ ENDIF reached');
            skipMode = false;
            insideIf = false;
            continue;
        }
        
        // Solo agregar si NO estamos saltando
        if (!skipMode) {
            filtered.push(line);
        } else {
            console.log('⏭️ Skipping line:', line.text.substring(0, 50));
        }
    }
    
    console.log('📝 Final filtered lines:', filtered.length);
    return filtered;
};

const GameEngine = () => {
    const [currentSceneId, setCurrentSceneId] = useState("1. INT. AULA. FACULTADE DE CIENCIAS - DÍA");
    const [gameState, setGameState] = useState({});
    
    const [dialogueIndex, setDialogueIndex] = useState(0);
    const [areChoicesVisible, setAreChoicesVisible] = useState(false);
    
    const [activeCharacters, setActiveCharacters] = useState({});

    const currentScene = historiaData[currentSceneId];
    const script = useMemo(() => parseScript(currentScene ? currentScene.text : '', gameState), [currentScene, gameState]);

    // FUNCIÓN DE EJECUCIÓN DE COMANDOS
    const executeCommands = useCallback((commands) => {
        if (!commands || commands.length === 0) return;

        setActiveCharacters(prevChars => {
            let newChars = { ...prevChars };
            commands.forEach(command => {
                const args = command.args.split('@');
                const charName = args[0];
                const position = args[1] || 'center'; 

                if (command.type === 'SCENE_START' || command.type === 'SHOW') {
                    newChars[charName] = position;
                } else if (command.type === 'HIDE') {
                    delete newChars[charName];
                }
            });
            return newChars;
        });
    }, []);

    // RESETEAR ESTADOS AL CAMBIAR DE ESCENA
    useEffect(() => {
        setDialogueIndex(0);
        setAreChoicesVisible(false); 
        setActiveCharacters({}); 

        if (script.length > 0) {
            executeCommands(script[0].commands);
        }
    }, [currentSceneId, script, executeCommands]);

    if (!currentScene) return <div className="p-10 text-white">ERROR: Escena no encontrada</div>;

    // LÓGICA DE AVANCE
    const handleScreenClick = () => {
        if (areChoicesVisible) return;

        if (dialogueIndex < script.length - 1) {
            executeCommands(script[dialogueIndex + 1].commands);
            setDialogueIndex(prev => prev + 1);
        } 
        else if (currentScene.choices.length > 0) {
            setAreChoicesVisible(true);
        }
    };

    const handleChoice = (choice) => {
        if (choice.state_change) {
            setGameState(prev => ({
                ...prev,
                [choice.state_change.variable]: choice.state_change.value
            }));
        }
        if (choice.target) {
            setCurrentSceneId(choice.target);
        }
    };

    const currentLine = script[dialogueIndex] || { speaker: null, text: "..." };
    const isLastLine = dialogueIndex === script.length - 1;

    // --- RENDERING ---
    return (
        <div 
          className="relative w-full h-screen bg-black overflow-hidden font-sans select-none cursor-pointer"
          onClick={handleScreenClick}
        >
            {/* CAPA 1: FONDO */}
            <div className="absolute inset-0 z-0">
                {currentScene.media?.IMG ? (
                    <img 
                      src={`/img/fondos/${currentScene.media.IMG}.jpg`} 
                      alt="BG" 
                      className="w-full h-full object-cover" 
                    />
                ) : (
                    <div className="w-full h-full bg-gray-900" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/20" />
            </div>
            
            {/* CAPA 2: PERSONAJES */}
            <div className="absolute bottom-0 left-0 right-0 z-10 h-full pointer-events-none flex justify-center items-end pb-0">
                {Object.keys(activeCharacters).map((charName) => {
                    const position = activeCharacters[charName];
                    let positionClass = '';

                    if (position === 'left') positionClass = 'left-0';
                    else if (position === 'right') positionClass = 'right-0';
                    else positionClass = 'transform left-1/2 -translate-x-1/2';

                    return (
                        <img 
                          key={charName}
                          src={`/img/personajes/${charName}.png`} 
                          alt={charName}
                          className={`absolute bottom-0 ${positionClass} max-h-[90vh] w-auto object-contain drop-shadow-2xl transition-all duration-700`}
                        />
                    );
                })}
            </div>
            
            {/* CAPA 3: MODAL DE DECISIONES */}
            {areChoicesVisible && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center animate-fade-in pb-10">
                    <h2 className="text-white/90 text-xl mb-8 uppercase tracking-[0.3em] font-bold animate-pulse">
                        Toma una decisión
                    </h2>
                    <div className="flex flex-col gap-6 w-full max-w-3xl px-4">
                        {currentScene.choices.map((choice, index) => (
                            <button
                              key={index}
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                handleChoice(choice); 
                              }}
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