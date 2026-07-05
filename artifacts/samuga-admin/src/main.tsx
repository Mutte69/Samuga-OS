import { createRoot } from 'react-dom/client';

import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';

import './index.css';

// Wire up the API base URL so customFetch prepends it to every relative request.
// VITE_API_BASE_URL must be set at build time (e.g. https://samuga-os.up.railway.app).
// If unset we fall back to same-origin (useful when API and admin share a host).
const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
if (apiBase) {
  setBaseUrl(apiBase);
}

createRoot(document.getElementById('root')!).render(<App />);
