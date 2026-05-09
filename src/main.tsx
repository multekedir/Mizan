import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

const el = document.getElementById('root')!;

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const app = clientId ? (
  <GoogleOAuthProvider clientId={clientId}>
    <App />
  </GoogleOAuthProvider>
) : (
  <App />
);

createRoot(el).render(
  <StrictMode>
    <ErrorBoundary>{app}</ErrorBoundary>
  </StrictMode>
);
