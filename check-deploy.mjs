
import { readFileSync, readdirSync } from 'fs';
import { TonClient, Address, TupleBuilder } from '@ton/ton';

const DIR = '/Users/fivestars/resu/resu-sc-ton/resu-sc-ton/deployments';
const d = JSON.parse(readFileSync(`${DIR}/mainnet.json`, 'utf8'));

const client = new TonClient({ endpoint: 'https://toncenter.com/api/v2/jsonRPC' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

console.log('contract state');
const all = [
    ['Vault', d.vault],
    ['Registry', d.registry],
    ...(d.trancheMasters ?? []).map((m, i) => [`Tranche master ${i}`, m]),
];
for (const [name, addr] of all) {
    const st = await retry(() => client.getContractState(A(addr)));
    check(`${name} is active`, st.state === 'active', `-> ${st.state}`);
}

console.log('\nlinks');
check('Vault knows the Registry', (await get(d.vault, 'registryAddress')).stack.readAddress().equals(A(d.registry)));
const vjw = (await get(d.vault, 'jettonWalletAddress')).stack.readAddressOpt();
check('Vault.jettonWallet matches the artifact', vjw?.equals(A(d.vaultJettonWallet)) ?? false);

const derived = (await get(d.jettonMaster, 'get_wallet_address', [A(d.vault)])).stack.readAddress();
check('the Vault\'s wallet is issued by the real tsTON master', derived.equals(A(d.vaultJettonWallet)), `-> ${derived}`);

if (d.trancheMasters) {
    console.log('\ntranche jettons');
    for (let i = 0; i < 3; i++) {
        const tm = (await get(d.vault, 'trancheMaster', [BigInt(i)])).stack.readAddressOpt();
        check(`Vault -> master ${i}`, tm?.equals(A(d.trancheMasters[i])) ?? false, `-> ${tm}`);

        const jd = await get(d.trancheMasters[i], 'get_jetton_data');
        jd.stack.readBigNumber();
        jd.stack.readBoolean();
        check(`master ${i} -> Vault`, jd.stack.readAddress().equals(A(d.vault)));
        const meta = jd.stack.readCell();
        console.log(`       metadata: ${meta.bits.length === 0 ? 'EMPTY (set later)' : 'set'}`);

        const tid = (await get(d.trancheMasters[i], 'trancheId')).stack.readNumber();
        check(`master ${i} knows its tranche`, tid === i, `-> ${tid}`);
    }
}

console.log('\nRegistry');
const rv = (await get(d.registry, 'vaultAddress')).stack.readAddressOpt();
check('Registry points at the current Vault', rv?.equals(A(d.vault)) ?? false, `-> ${rv}`);
if (rv && !rv.equals(A(d.vault))) {
    console.log('       The Registry deploys deterministically, so on');
    console.log('       re-deploy it lands on the SAME address, and SetVault is one-time:');
    console.log('       it stayed bound to the old Vault. The insurance layer in the new');
    console.log('       version won\'t work until the Registry is deployed anew.');
}

console.log('\nmandate');
const vs = await get(d.vault, 'vaultState');
vs.stack.readBigNumber();
vs.stack.readBigNumber();
check('loss ceiling', vs.stack.readNumber() === d.mandate.maxLossBps);
check('exit window', vs.stack.readNumber() === d.mandate.withdrawDelay);
const cs = await get(d.vault, 'codeState');
cs.stack.readNumber();
check('upgrade timelock', cs.stack.readNumber() === d.upgradeTimelock);

const archives = readdirSync(DIR).filter((f) => f.startsWith('mainnet.') && f !== 'mainnet.json');
if (archives.length) {
    console.log('\npast deployments');
    for (const f of archives) {
        const prev = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'));
        const t = await get(prev.vault, 'trancheState', [0n]);
        const assets = t.stack.readBigNumber();
        console.log(
            `  ${f}: junior ${(Number(assets) / 1e9).toFixed(6)} tsTON` +
                (assets > 0n ? '  <- funds still there, withdraw: blueprint run exitV1' : ''),
        );
    }
}

console.log(bad === 0 ? '\ndeployed correctly' : `\nproblems: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
