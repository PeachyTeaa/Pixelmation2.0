import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installAgentApi } from './agent/bridge';
import './styles/base.css';

const container = document.getElementById('root');
if (!container) throw new Error('Не найден #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Руки агента доступны сразу после загрузки страницы.
installAgentApi();
