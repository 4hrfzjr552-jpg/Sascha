import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { CloudWorkspace } from './components/CloudWorkspace.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname === '/cloud' ? <CloudWorkspace /> : <App />}
  </StrictMode>,
);
