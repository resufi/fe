import { Address } from '@ton/core';
import testnet from '../deployments/testnet.json';
import mainnet from '../deployments/mainnet.json';

export type Mandate = {
    maxLossBps: number;
    withdrawDelay: number;
    seniorFeeBps: number;
    seniorFeeToMezzBps: number;
    mezzFeeBps: number;
};

export type Deployment = {
    network: 'testnet' | 'mainnet';
    vault: string | null;
    registry: string | null;
    jettonMaster: string | null;
    vaultJettonWallet: string | null;
    mandate: Mandate;
};

/**
 * Адреса берутся из deployments/<network>.json, который пишет скрипт деплоя.
 * Сеть выбирается через VITE_NETWORK (по умолчанию testnet), чтобы случайно
 * не показать боевые адреса при локальной разработке.
 *
 * Пока протокол не развёрнут, поля пустые — интерфейс это показывает честно,
 * а не притворяется работающим.
 */
const NETWORK = (import.meta.env.VITE_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';

export const deployment = (NETWORK === 'mainnet' ? mainnet : testnet) as unknown as Deployment;

export const isDeployed = Boolean(deployment.vault && deployment.jettonMaster);

export const addr = {
    vault: () => Address.parse(deployment.vault!),
    registry: () => Address.parse(deployment.registry!),
    jettonMaster: () => Address.parse(deployment.jettonMaster!),
    /** Пул Tonstakers — единственный источник курса tsTON к GRAM. */
    assetPool: () => (ASSET_POOL ? Address.parse(ASSET_POOL) : null),
};

/**
 * Пул ликвидного стейкинга, обеспечивающий базовый жетон.
 *
 * Отдельно от jettonMaster: у Tonstakers это два разных контракта, и пул
 * на get_wallet_address отвечает exit_code 11. Перепутать их легко.
 */
const ASSET_POOL = 'EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR';

/**
 * Подписи траншей.
 *
 * Сознательно коротко: место в очереди на убыток — единственное, что человеку
 * нужно знать, чтобы выбрать. Всё остальное показывается только по запросу,
 * иначе экран превращается в статью, которую никто не читает.
 */
export const TRANCHES = [
    { id: 0, key: 'junior', name: 'Junior', order: 'Absorbs losses first' },
    { id: 1, key: 'mezzanine', name: 'Mezzanine', order: 'Absorbs losses second' },
    { id: 2, key: 'senior', name: 'Senior', order: 'Absorbs losses last' },
] as const;

export type TrancheMeta = (typeof TRANCHES)[number];

export { DECIMALS } from './units.ts';
