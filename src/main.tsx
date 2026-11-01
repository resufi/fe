import './polyfills';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { THEME, TonConnectUIProvider } from '@tonconnect/ui-react';
import App from './App';
import './styles/tokens.css';
import { env } from "./lib/env.ts";
import { useTheme } from "./hooks/useTheme.ts";

const manifestUrl =
	env("VITE_TONCONNECT_MANIFEST_URL") ??
	new URL(

		`${import.meta.env.BASE_URL}tonconnect-manifest.json`.replace(/\/{2,}/g, "/"),
		window.location.origin,
	).toString();

function Root() {
    const theme = useTheme();

    return (
        <TonConnectUIProvider
            manifestUrl={manifestUrl}
            uiPreferences={{ theme: theme === "dark" ? THEME.DARK : THEME.LIGHT }}
        >
            <App />
        </TonConnectUIProvider>
    );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Root />
    </React.StrictMode>,
);
