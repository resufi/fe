/**
 * Сверяет развёрнутый протокол с тем, что задумывали.
 *
 * Живёт рядом с фронтендом намеренно: проверяет ровно тот артефакт деплоя,
 * на который фронтенд смотрит. Подключать интерфейс к наполовину развёрнутому
 * протоколу — худший из возможных способов узнать об ошибке.
 *
 * Запуск: npm run verify-deploy
 */
import { readFileSync, readdirSync } from 'fs';
import { TonClient, Address, TupleBuilder } from '@ton/ton';

const DIR = '/Users/fivestars/resu/resu-sc-ton/resu-sc-ton/deployments';
const d = JSON.parse(readFileSync(`${DIR}/mainnet.json`, 'utf8'));

const client = new TonClient({ endpoint: 'https://toncenter.com/api/v2/jsonRPC' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Публичный toncenter лимитирован; без повтора проверка обрывается на середине
// и выглядит как поломка протокола, хотя это всего лишь отказ узла.
async function retry(fn, tries = 5) {
    for (let i = 0; ; i++) {
        await sleep(1300);
        try {
            return await fn();
        } catch (e) {
            const limited = e?.response?.status === 429 || String(e?.message ?? '').includes('429');
            if (!limited || i >= tries) throw e;
            await sleep(1500 * 2 ** i);
        }
    }
}

let bad = 0;
const check = (name, ok, extra = '') => {
    console.log(ok ? `  ok   ${name}` : `  FAIL ${name} ${extra}`);
    if (!ok) bad++;
};

const get = (addr, method, args = []) =>
    retry(() => {
        const b = new TupleBuilder();
        for (const a of args) (typeof a === 'bigint' ? b.writeNumber(a) : b.writeAddress(a));
        return client.runMethod(Address.parse(addr), method, b.build());
    });

const A = (s) => Address.parse(s);

console.log('состояние контрактов');
const all = [
    ['Vault', d.vault],
    ['Registry', d.registry],
    ...(d.trancheMasters ?? []).map((m, i) => [`Мастер транша ${i}`, m]),
];
for (const [name, addr] of all) {
    const st = await retry(() => client.getContractState(A(addr)));
    check(`${name} активен`, st.state === 'active', `-> ${st.state}`);
}

console.log('\nсвязки');
check('Vault знает Registry', (await get(d.vault, 'registryAddress')).stack.readAddress().equals(A(d.registry)));
const vjw = (await get(d.vault, 'jettonWalletAddress')).stack.readAddressOpt();
check('Vault.jettonWallet совпадает с артефактом', vjw?.equals(A(d.vaultJettonWallet)) ?? false);

const derived = (await get(d.jettonMaster, 'get_wallet_address', [A(d.vault)])).stack.readAddress();
check('кошелёк Vault выдан настоящим мастером tsTON', derived.equals(A(d.vaultJettonWallet)), `-> ${derived}`);

if (d.trancheMasters) {
    console.log('\nжетоны траншей');
    for (let i = 0; i < 3; i++) {
        const tm = (await get(d.vault, 'trancheMaster', [BigInt(i)])).stack.readAddressOpt();
        check(`Vault -> мастер ${i}`, tm?.equals(A(d.trancheMasters[i])) ?? false, `-> ${tm}`);

        const jd = await get(d.trancheMasters[i], 'get_jetton_data');
        jd.stack.readBigNumber();
        jd.stack.readBoolean();
        check(`мастер ${i} -> Vault`, jd.stack.readAddress().equals(A(d.vault)));
        const meta = jd.stack.readCell();
        console.log(`       метадата: ${meta.bits.length === 0 ? 'ПУСТАЯ (зальётся позже)' : 'задана'}`);

        const tid = (await get(d.trancheMasters[i], 'trancheId')).stack.readNumber();
        check(`мастер ${i} знает свой транш`, tid === i, `-> ${tid}`);
    }
}

console.log('\nRegistry');
const rv = (await get(d.registry, 'vaultAddress')).stack.readAddressOpt();
check('Registry смотрит на текущий Vault', rv?.equals(A(d.vault)) ?? false, `-> ${rv}`);
if (rv && !rv.equals(A(d.vault))) {
    console.log('       Registry разворачивается детерминированно, поэтому при');
    console.log('       переразвёртывании встаёт на ТОТ ЖЕ адрес, а SetVault одноразовый:');
    console.log('       он остался привязан к прошлому Vault. Страховой слой в новой');
    console.log('       версии работать не будет, пока Registry не развернут заново.');
}

console.log('\nмандат');
const vs = await get(d.vault, 'vaultState');
vs.stack.readBigNumber();
vs.stack.readBigNumber();
check('потолок потерь', vs.stack.readNumber() === d.mandate.maxLossBps);
check('окно выхода', vs.stack.readNumber() === d.mandate.withdrawDelay);
const cs = await get(d.vault, 'codeState');
cs.stack.readNumber();
check('таймлок обновления', cs.stack.readNumber() === d.upgradeTimelock);

const archives = readdirSync(DIR).filter((f) => f.startsWith('mainnet.') && f !== 'mainnet.json');
if (archives.length) {
    console.log('\nпрошлые развёртывания');
    for (const f of archives) {
        const prev = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'));
        const t = await get(prev.vault, 'trancheState', [0n]);
        const assets = t.stack.readBigNumber();
        console.log(
            `  ${f}: junior ${(Number(assets) / 1e9).toFixed(6)} tsTON` +
                (assets > 0n ? '  <- средства ещё там, вывести: blueprint run exitV1' : ''),
        );
    }
}

console.log(bad === 0 ? '\nразвёрнуто корректно' : `\nпроблем: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
