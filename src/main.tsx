// Первым: выставляет Buffer до того, как исполнится тело @ton/core.
import './polyfills';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import App from './App';
import './styles/tokens.css';

/**
 * Манифест TonConnect.
 *
 * Кошелёк СКАЧИВАЕТ манифест сам, со своего устройства. Поэтому адрес обязан
 * быть публично доступен по https: localhost кошелёк не видит и отвечает
 * «invalid manifest» — даже если файл прекрасно открывается в браузере
 * разработчика.
 *
 * На локальной разработке задайте VITE_TONCONNECT_MANIFEST_URL: любой
 * публичный https-адрес с этим json (raw.githubusercontent, gist, туннель).
 * В продакшене подойдёт путь по умолчанию — там origin уже публичный.
 */
const manifestUrl =
    import.meta.env.VITE_TONCONNECT_MANIFEST_URL ??
    new URL('/tonconnect-manifest.json', window.location.origin).toString();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <TonConnectUIProvider manifestUrl={manifestUrl}>
            <App />
        </TonConnectUIProvider>
    </React.StrictMode>,
);
