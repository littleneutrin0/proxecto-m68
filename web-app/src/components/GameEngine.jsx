import React, { useState, useEffect, useMemo, useCallback } from 'react';
import historiaData from '../data/historia.json';
import { io } from 'socket.io-client';
import QRCode from "react-qr-code"; // Importamos el generador de QR

// TRUCO PRO: Usamos la IP de la barra de direcciones del navegador automáticamente
const serverUrl = `http://${window.location.hostname}:3001`;
const clientUrl = `http://${window.location.hostname}:5173/votar`;

const socket = io(serverUrl);

// --- FUNCIÓN DE PARSEO (Sin cambios) ---
const processLine = (line) => {
    if (!line) return { speaker: null, text: '', commands: [], conditional: null };
    const commandRegex = /\{\{(SCENE_START|SHOW|HIDE|IA_CONTEXT|IA_PROMPT|IF|ELSE|ENDIF)(?::\s*(.+?))?\}\}/g;
    const speakerRegex = /^([A-ZÁÉÍÓÚÑ a-záéíóúñ]+):(.+)/;
    
    let commands = [];
    let conditional = null;
    let text = line;
    
    const foundCommands = [...line.matchAll(commandRegex)];
    foundCommands.forEach(match => {
        const type = match[1]; 
        const args = match[2] ? match[2].trim() : '';
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

    text = text.replace(commandRegex, '').trim();
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
    const filtered = [];
    let skipMode = false;
    
    for (let i = 0; i < parsed.length; i++) {
        const line = parsed[i];
        if (line.conditional?.type === 'IF') {
            const variable = line.conditional.variable.trim();
            const expectedValue = line.conditional.value.trim();
            const actualValue = String(gameState[variable] || '').trim();
            skipMode = (actualValue !== expectedValue);
            continue;
        }
        if (line.conditional?.type === 'ELSE') {
            skipMode = !skipMode;
            continue;
        }
        if (line.conditional?.type === 'ENDIF') {
            skipMode = false;
            continue;
        }
        if (!skipMode) filtered.push(line);
    }
    return filtered;
};

const GameEngine = () => {
    // ESTADO DEL LOBBY (Nuevo)
    const [isLobby, setIsLobby] = useState(true);

    const [currentSceneId, setCurrentSceneId] = useState("1. INT. AULA. FACULTADE DE CIENCIAS - DÍA");
    const [gameState, setGameState] = useState({});
    const [dialogueIndex, setDialogueIndex] = useState(0);
    const [areChoicesVisible, setAreChoicesVisible] = useState(false);
    const [activeCharacters, setActiveCharacters] = useState({});
    const [voteResults, setVoteResults] = useState([]);
    const [isVoting, setIsVoting] = useState(false);

    const currentScene = historiaData[currentSceneId];
    const script = useMemo(() => parseScript(currentScene ? currentScene.text : '', gameState), [currentScene, gameState]);

    // --- SOCKETS ---
    useEffect(() => {
        socket.on('update_results', (results) => setVoteResults(results));
        return () => socket.off('update_results');
    }, []);

// CUANDO SALEN LAS OPCIONES -> INICIAR VOTACIÓN (SOLO SI HAY MÁS DE UNA)
    useEffect(() => {
        if (!isLobby && areChoicesVisible && currentScene.choices.length > 0) {
            
            // SI HAY MÁS DE 1 OPCIÓN -> MODO VOTACIÓN (TEATRO)
            if (currentScene.choices.length > 1) {
                setIsVoting(true);
                setVoteResults(new Array(currentScene.choices.length).fill(0));
                
                const labels = currentScene.choices.map(c => c.label);
                socket.emit('host_start_vote', labels);
            } 
            // SI SOLO HAY 1 OPCIÓN -> MODO CONTINUAR (SOLO HOST)
            else {
                setIsVoting(false);
                // Avisamos a los móviles que NO hay votación, para que sigan esperando
                socket.emit('host_end_vote');
            }

        } else {
            setIsVoting(false);
            socket.emit('host_end_vote');
        }
    }, [areChoicesVisible, currentScene, isLobby]);

    useEffect(() => {
        if (!isLobby && currentScene && currentScene.ai && currentScene.ai.ROUTER) {
            const router = currentScene.ai.ROUTER;
            const currentValue = String(gameState[router.variable] || '');
            if (currentValue === router.value) setCurrentSceneId(router.targetTrue);
            else setCurrentSceneId(router.targetFalse);
        }
    }, [currentSceneId, currentScene, gameState, isLobby]);

    const executeCommands = useCallback((commands) => {
        if (!commands || commands.length === 0) return;
        setActiveCharacters(prevChars => {
            let newChars = { ...prevChars };
            commands.forEach(command => {
                const args = command.args.split('@');
                const charName = args[0];
                const position = args[1] || 'center'; 
                if (command.type === 'SCENE_START' || command.type === 'SHOW') newChars[charName] = position;
                else if (command.type === 'HIDE') delete newChars[charName];
            });
            return newChars;
        });
    }, []);

    useEffect(() => {
        setDialogueIndex(0);
        setAreChoicesVisible(false); 
        setActiveCharacters({}); 
        if (!isLobby && script.length > 0) executeCommands(script[0].commands);
    }, [currentSceneId, script, executeCommands, isLobby]);

    const handleScreenClick = () => {
        if (areChoicesVisible) return;
        if (dialogueIndex < script.length - 1) {
            executeCommands(script[dialogueIndex + 1].commands);
            setDialogueIndex(prev => prev + 1);
        } else if (currentScene.choices.length > 0) {
            setAreChoicesVisible(true);
        }
    };

    const handleChoice = (choice) => {
        if (choice.state_change) {
            setGameState(prev => ({...prev, [choice.state_change.variable]: choice.state_change.value}));
        }
        if (choice.target) setCurrentSceneId(choice.target);
    };

    if (!currentScene) return <div className="p-10 text-white">ERROR: Escena no encontrada</div>;
    const currentLine = script[dialogueIndex] || { speaker: null, text: "..." };
    const isLastLine = dialogueIndex === script.length - 1;

    // --- RENDERIZADO DEL LOBBY (PANTALLA DE INICIO) ---
    if (isLobby) {
        return (
            <div className="h-screen w-full bg-black flex flex-col items-center justify-center text-white relative overflow-hidden">
                 {/* Fondo sutil animado */}
                <div className="absolute inset-0 bg-[url('/img/fondos/int_aula_ciencias_dia.jpg')] bg-cover opacity-20 blur-sm scale-110"></div>
                
                <div className="z-10 flex flex-col items-center gap-8 p-10 bg-black/60 backdrop-blur-md rounded-3xl border border-white/10 shadow-2xl">
                    <h1 className="text-6xl font-black tracking-tighter uppercase text-yellow-500">
                        Marzo del 68
                    </h1>
                    <p className="text-xl text-gray-300 max-w-lg text-center">
                        Conéctate a la red <strong>TEATRO_M68</strong> y escanea el código para participar.
                    </p>
                    
                    {/* QR GIGANTE */}
                    <div className="bg-white p-4 rounded-xl shadow-lg">
                        <QRCode value={clientUrl} size={256} />
                    </div>
                    
                    <p className="font-mono text-yellow-500 text-lg tracking-widest animate-pulse">
                        ESPERANDO A LOS JUGADORES...
                    </p>

                    <button 
                        onClick={() => setIsLobby(false)}
                        className="mt-8 px-8 py-3 bg-white text-black font-bold rounded hover:bg-yellow-500 transition-colors"
                    >
                        COMENZAR FUNCIÓN
                    </button>
                </div>
            </div>
        );
    }

    // --- RENDERIZADO DEL JUEGO ---
    return (
        <div className="relative w-full h-screen bg-black overflow-hidden font-sans select-none cursor-pointer" onClick={handleScreenClick}>
            
            {/* CAPA 1: FONDO */}
            <div className="absolute inset-0 z-0">
                {currentScene.media?.IMG ? (
                    <img src={`/img/fondos/${currentScene.media.IMG}.jpg`} alt="BG" className="w-full h-full object-cover" />
                ) : <div className="w-full h-full bg-gray-900" />}
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
                        <img key={charName} src={`/img/personajes/${charName}.png`} alt={charName} 
                             className={`absolute bottom-0 ${positionClass} max-h-[90vh] w-auto object-contain drop-shadow-2xl transition-all duration-700`} />
                    );
                })}
            </div>
            
           {/* CAPA 3: SISTEMA DE NAVEGACIÓN (Votación o Continuar) */}
            {areChoicesVisible && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center animate-fade-in pb-10">
                    
                    {/* CASO A: VOTACIÓN (Más de 1 opción) - Fondo oscuro y Barras */}
                    {currentScene.choices.length > 1 && (
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center">
                            
                            {/* QR PEQUEÑO */}
                            <div className="absolute top-8 right-8 bg-white p-2 rounded opacity-80 hover:opacity-100 transition-opacity flex flex-col items-center gap-1">
                                <QRCode value={clientUrl} size={80} />
                                <span className="text-[10px] font-bold uppercase text-black">Unirse</span>
                            </div>

                            <h2 className="text-white/90 text-xl mb-8 uppercase tracking-[0.3em] font-bold animate-pulse">
                                La audiencia decide
                            </h2>
                            
                            <div className="flex flex-col gap-6 w-full max-w-3xl px-4">
                                {currentScene.choices.map((choice, index) => {
                                    const totalVotes = voteResults.reduce((a, b) => a + b, 0);
                                    const myVotes = voteResults[index] || 0;
                                    const percentage = totalVotes > 0 ? (myVotes / totalVotes) * 100 : 0;
                                    
                                    return (
                                        <button key={index} onClick={(e) => { e.stopPropagation(); handleChoice(choice); }}
                                          className="group relative w-full py-6 px-8 bg-gray-900 border-l-8 border-yellow-500 text-2xl md:text-3xl font-bold uppercase text-left hover:scale-105 transition-all duration-300 shadow-2xl cursor-pointer overflow-hidden">
                                            <div className="absolute left-0 top-0 bottom-0 bg-yellow-600/40 transition-all duration-500 z-0" style={{ width: `${percentage}%` }} />
                                            <div className="relative z-10 flex justify-between w-full items-center text-yellow-500 group-hover:text-white">
                                                <span>{choice.label}</span>
                                                <span className="text-lg opacity-80">{myVotes} ({Math.round(percentage)}%)</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* CASO B: CONTINUAR (Solo 1 opción) - Botón discreto para el HOST */}
                    {currentScene.choices.length === 1 && (
                        <div className="absolute bottom-32 right-10 z-50">
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleChoice(currentScene.choices[0]); }}
                                className="bg-yellow-500 text-black px-8 py-3 rounded-full font-bold text-xl hover:bg-white hover:scale-110 transition-all shadow-[0_0_20px_rgba(234,179,8,0.5)] flex items-center gap-2 animate-bounce"
                            >
                                CONTINUAR <span className="text-2xl">→</span>
                            </button>
                        </div>
                    )}

                </div>
            )}
            
            {/* CAPA 4: CAJA DE DIÁLOGO */}
            <div className={`absolute bottom-0 w-full p-4 md:p-10 transition-all duration-700 ${areChoicesVisible ? 'z-0 opacity-0 pointer-events-none translate-y-10' : 'z-40 opacity-100'}`}>
                <div className="w-full max-w-7xl mx-auto">
                    {currentLine.speaker && (
                        <div className="inline-block bg-yellow-600 text-black font-black text-xl md:text-2xl px-6 py-2 uppercase tracking-wider transform -skew-x-12 mb-2 ml-4 shadow-lg border-2 border-white/20">
                            {currentLine.speaker}
                        </div>
                    )}
                    <div className="bg-black/90 border-2 border-gray-600 rounded-2xl p-8 md:p-10 shadow-2xl relative min-h-[200px] flex items-center">
                        <p className="text-white text-2xl md:text-4xl font-medium leading-relaxed drop-shadow-md">{currentLine.text}</p>
                        {!isLastLine && <div className="absolute bottom-4 right-6 animate-bounce text-yellow-500 text-3xl">▼</div>}
                        {isLastLine && !areChoicesVisible && currentScene.choices.length > 0 && <div className="absolute bottom-4 right-6 animate-pulse text-yellow-500 text-4xl">▶</div>}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GameEngine;