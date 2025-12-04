import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import GameEngine from './components/GameEngine';
import MobileVoter from './components/MobileVoter';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Ruta Principal (Pantalla Grande) */}
        <Route path="/" element={<GameEngine />} />
        
        {/* Ruta para Móviles */}
        <Route path="/votar" element={<MobileVoter />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;