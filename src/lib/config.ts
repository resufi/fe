import { Address } from '@ton/core';
import testnet from '../deployments/testnet.json';

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
 * Пока протокол не развёрнут, поля пустые — интерфейс это показывает честно,
 * а не притворяется работающим.
 */
export const deployment = testnet as unknown as Deployment;

export const isDeployed = Boolean(deployment.vault && deployment.jettonMaster);

export const addr = {
    vault: () => Address.parse(deployment.vault!),
    registry: () => Address.parse(deployment.registry!),
    jettonMaster: () => Address.parse(deployment.jettonMaster!),
};

export const TRANCHES = [
    {
        id: 0,
        key: 'junior',
        name: 'Junior',
        tagline: 'Принимает первый убыток',
        blurb: 'Забирает всю плату старших траншей. Первым же теряет деньги, если случится инцидент.',
    },
    {
        id: 1,
        key: 'mezzanine',
        name: 'Mezzanine',
        tagline: 'Второй в очереди на убыток',
        blurb: 'Страдает только после того, как junior обнулён. Получает долю платы senior.',
    },
    {
        id: 2,
        key: 'senior',
        name: 'Senior',
        tagline: 'Защищён младшими траншами',
        blurb: 'Платит за защиту частью доходности. Теряет деньги последним — и только если пробиты оба транша под ним.',
    },
] as const;

export type TrancheMeta = (typeof TRANCHES)[number];

export { DECIMALS } from './units.ts';
