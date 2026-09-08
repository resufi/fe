/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Сеть Solana: devnet (по умолчанию) или mainnet. */
    readonly VITE_SOLANA_NETWORK?: 'devnet' | 'mainnet';
    /** Свой RPC для Solana вместо публичного. */
    readonly VITE_SOLANA_RPC?: string;
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

/** Переменные сборки, см. vite.config.ts и src/lib/env.ts. */
declare const __RESU_ENV__: Record<string, string | undefined> | undefined;
