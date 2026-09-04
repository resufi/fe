/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Какую сеть показывать: testnet (по умолчанию) или mainnet. */
    readonly VITE_NETWORK?: 'testnet' | 'mainnet';
    /** Свой RPC вместо публичного ton-access — см. .env.example. */
    readonly VITE_TON_ENDPOINT?: string;
    readonly VITE_TONCENTER_API_KEY?: string;
    /** Публичный URL манифеста TonConnect — кошельки должны его скачать. */
    readonly VITE_TONCONNECT_MANIFEST_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
