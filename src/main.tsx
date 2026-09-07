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
 * После публикации на GitHub Pages переменная не нужна — там адрес уже
 * публичный, и путь по умолчанию сработает сам.
 */
const manifestUrl =
	import.meta.env.VITE_TONCONNECT_MANIFEST_URL ??
	new URL(
		// BASE_URL, а не корень сайта: на GitHub Pages приложение живёт по
		// пути /<репозиторий>/, и ссылка от origin вела бы мимо — кошелёк
		// получил бы 404 и ответил «invalid manifest».
		`${import.meta.env.BASE_URL}tonconnect-manifest.json`.replace(/\/{2,}/g, "/"),
		window.location.origin,
	).toString();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <TonConnectUIProvider manifestUrl={manifestUrl}>
            <App />
        </TonConnectUIProvider>
    </React.StrictMode>,
);
