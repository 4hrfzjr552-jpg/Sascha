import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { CloudWorkspace } from './components/CloudWorkspace.tsx';
import { InboxWorkspace } from './components/InboxWorkspace.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname === '/cloud' ? <CloudWorkspace /> : window.location.pathname === '/inbox' ? <InboxWorkspace /> : <App />}
  </StrictMode>,
);
