/**
 * Сверяет развёрнутый протокол с тем, что задумывали.
 *
 * Живёт рядом с фронтендом намеренно: проверяет ровно тот артефакт деплоя,
 * на который фронтенд смотрит. Подключать интерфейс к наполовину развёрнутому
 * протоколу — худший из возможных способов узнать об ошибке.
 *
 * Запуск: npm run verify-deploy
 */
import { readFileSync } from 'fs';
import { TonClient, Address, TupleBuilder } from '@ton/ton';

const d = JSON.parse(readFileSync('/Users/fivestars/resu/resu-sc-ton/resu-sc-ton/deployments/mainnet.json', 'utf8'));
// Намеренно toncenter: ton-access ранее отдавал состояние с отставшего узла.
const client = new TonClient({ endpoint: 'https://toncenter.com/api/v2/jsonRPC' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let bad = 0;
const check = (name, ok, extra = '') => {
    console.log(ok ? `  ok   ${name}` : `  FAIL ${name} ${extra}`);
    if (!ok) bad++;
};

async function get(addr, method, args = []) {
    await sleep(1600);
    const b = new TupleBuilder();
    for (const a of args) (typeof a === 'bigint' ? b.writeNumber(a) : b.writeAddress(a));
    return client.runMethod(Address.parse(addr), method, b.build());
}

console.log('состояние контрактов');
for (const [name, a] of [['Vault', d.vault], ['Registry', d.registry]]) {
    await sleep(1600);
    const st = await client.getContractState(Address.parse(a));
    check(`${name} активен`, st.state === 'active', `-> ${st.state}`);
}

console.log('\nсвязки Vault -> …');
const reg = (await get(d.vault, 'registryAddress')).stack.readAddress();
check('Vault знает Registry', reg.equals(Address.parse(d.registry)), `-> ${reg}`);

const vjw = (await get(d.vault, 'jettonWalletAddress')).stack.readAddressOpt();
check('Vault.jettonWallet установлен', vjw !== null);
check('…и совпадает с артефактом', vjw?.equals(Address.parse(d.vaultJettonWallet)) ?? false);

console.log('\nсвязки Registry -> …');
const rv = (await get(d.registry, 'vaultAddress')).stack.readAddressOpt();
check('Registry знает Vault', rv?.equals(Address.parse(d.vault)) ?? false, `-> ${rv}`);

const rjw = (await get(d.registry, 'jettonWalletAddress')).stack.readAddressOpt();
check('Registry.jettonWallet установлен', rjw !== null);

console.log('\nкошельки жетона выданы настоящим мастером tsTON');
const derivedV = (await get(d.jettonMaster, 'get_wallet_address', [Address.parse(d.vault)])).stack.readAddress();
check('кошелёк Vault сходится с мастером', derivedV.equals(Address.parse(d.vaultJettonWallet)), `-> ${derivedV}`);
const derivedR = (await get(d.jettonMaster, 'get_wallet_address', [Address.parse(d.registry)])).stack.readAddress();
check('кошелёк Registry сходится с мастером', rjw ? derivedR.equals(rjw) : false, `-> ${derivedR}`);

console.log('\nмандат — сверка с тем, что задумывали');
const vs = await get(d.vault, 'vaultState');
vs.stack.readBigNumber(); vs.stack.readBigNumber();
const maxLoss = vs.stack.readNumber(), wd = vs.stack.readNumber();
check('потолок потерь 30%', maxLoss === d.mandate.maxLossBps, `-> ${maxLoss}`);
check('окно выхода 3 дня', wd === d.mandate.withdrawDelay, `-> ${wd}`);

const pt = await get(d.vault, 'protectionTerms');
const sf = pt.stack.readNumber(), stm = pt.stack.readNumber(), mf = pt.stack.readNumber();
check('плата senior 2%', sf === d.mandate.seniorFeeBps, `-> ${sf}`);
check('доля mezzanine 3%', stm === d.mandate.seniorFeeToMezzBps, `-> ${stm}`);
check('mezzanine не платит', mf === d.mandate.mezzFeeBps, `-> ${mf}`);

const cs = await get(d.vault, 'codeState');
const pv = cs.stack.readNumber(), tl = cs.stack.readNumber();
check('версия кода позиций = 1', pv === 1, `-> ${pv}`);
check('таймлок = 0 (как и договаривались на тесты)', tl === 0, `-> ${tl}`);

console.log(bad === 0 ? '\nразвёрнуто корректно' : `\nпроблем: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
