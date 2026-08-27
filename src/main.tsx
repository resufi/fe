// Первым: выставляет Buffer до того, как исполнится тело @ton/core.
import './polyfills';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import App from './App';
import './styles.css';

const manifestUrl = new URL('/tonconnect-manifest.json', window.location.origin).toString();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <TonConnectUIProvider manifestUrl={manifestUrl}>
            <App />
        </TonConnectUIProvider>
    </React.StrictMode>,
);
