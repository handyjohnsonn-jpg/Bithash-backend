'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    getSigningTreasuryWallet,
    loadTreasuryWallets
} = require('./treasury-wallet-config');

const assetNetworkMap = {
    ETH: { network: 'ETH', chainId: 1, type: 'evm' },
    BTC: { network: 'BTC', chainId: 0, type: 'utxo' }
};

const load = (entries, deriveAddress = () => '0xabc') => loadTreasuryWallets({
    rawConfig: JSON.stringify(entries),
    assetNetworkMap,
    isValidAddress: () => true,
    deriveAddress
});

test('returns no wallets when no explicit configuration exists', () => {
    assert.deepEqual(loadTreasuryWallets({ rawConfig: '', assetNetworkMap }), []);
});

test('rejects a configured network that does not match the asset', () => {
    assert.throws(() => load([{
        id: 'eth-main', asset: 'ETH', network: 'BSC', address: '0xabc',
        derivationPath: "m/44'/60'/0'/0/1", signingEnabled: true
    }]), /network must match ETH/);
});

test('rejects more than one signing wallet for an asset and network', () => {
    const entry = {
        id: 'eth-main', asset: 'ETH', network: 'ETH', address: '0xabc',
        derivationPath: "m/44'/60'/0'/0/1", signingEnabled: true
    };
    assert.throws(() => load([
        entry,
        { ...entry, id: 'eth-second', derivationPath: "m/44'/60'/0'/0/2" }
    ]), /Only one signing treasury wallet/);
});

test('rejects a configured address that does not match the derived address', () => {
    assert.throws(() => load([{
        id: 'eth-main', asset: 'ETH', network: 'ETH', address: '0xdef',
        derivationPath: "m/44'/60'/0'/0/1", signingEnabled: true
    }]), /does not match its configured derivationPath/);
});

test('resolves signing wallets only from the explicit configuration', () => {
    const wallets = load([{
        id: 'eth-main', asset: 'ETH', network: 'ETH', address: '0xabc',
        derivationPath: "m/44'/60'/0'/0/1", signingEnabled: true
    }]);
    assert.equal(getSigningTreasuryWallet(wallets, 'eth', 'ETH'), wallets[0]);
    assert.throws(() => getSigningTreasuryWallet([], 'ETH', 'ETH'), /No signing treasury wallet is configured/);
});