
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

/*
 * TonConnect carries its own theme, and it used to be pinned to LIGHT: the
 * wallet modal and the dropdown stayed light over a dark page. It follows the
 * app's theme now, which is why the provider needs a component around it —
 * only a component can subscribe.
 */
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
