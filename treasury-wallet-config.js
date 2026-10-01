'use strict';

function loadTreasuryWallets({ rawConfig, assetNetworkMap, isValidAddress, deriveAddress }) {
    if (!rawConfig) return [];

    let configured;
    try {
        configured = JSON.parse(rawConfig);
    } catch (error) {
        throw new Error('TREASURY_WALLETS_JSON must contain valid JSON');
    }

    if (!Array.isArray(configured)) {
        throw new Error('TREASURY_WALLETS_JSON must be an array');
    }

    const ids = new Set();
    const signers = new Set();

    return configured.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new Error(`Treasury wallet at index ${index} must be an object`);
        }

        const id = typeof entry.id === 'string' ? entry.id.trim() : '';
        const asset = typeof entry.asset === 'string' ? entry.asset.trim().toUpperCase() : '';
        const address = typeof entry.address === 'string' ? entry.address.trim() : '';
        const derivationPath = typeof entry.derivationPath === 'string' ? entry.derivationPath.trim() : '';
        const networkConfig = assetNetworkMap[asset];
        const network = typeof entry.network === 'string' ? entry.network.trim() : '';

        if (!id || ids.has(id)) {
            throw new Error(`Treasury wallet at index ${index} must have a unique id`);
        }
        if (!networkConfig) {
            throw new Error(`Treasury wallet ${id} uses unsupported asset ${asset || '(missing)'}`);
        }
        if (!network || network !== networkConfig.network) {
            throw new Error(`Treasury wallet ${id} network must match ${networkConfig.network}`);
        }
        if (!address || !isValidAddress(address, asset)) {
            throw new Error(`Treasury wallet ${id} has an invalid ${asset} address`);
        }
        if (!/^m(?:\/\d+'?)+$/.test(derivationPath)) {
            throw new Error(`Treasury wallet ${id} must have a valid derivationPath`);
        }

        const signingEnabled = entry.signingEnabled === true;
        const signerKey = `${asset}:${network}`;
        if (signingEnabled && signers.has(signerKey)) {
            throw new Error(`Only one signing treasury wallet may be configured for ${asset} on ${network}`);
        }

        const derivedAddress = deriveAddress(asset, derivationPath);
        const addressesMatch = networkConfig.type === 'evm'
            ? derivedAddress?.toLowerCase() === address.toLowerCase()
            : derivedAddress === address;
        if (!addressesMatch) {
            throw new Error(`Treasury wallet ${id} address does not match its configured derivationPath`);
        }

        ids.add(id);
        if (signingEnabled) signers.add(signerKey);

        return Object.freeze({
            id,
            asset,
            network,
            chainId: networkConfig.chainId,
            type: networkConfig.type,
            address,
            derivationPath,
            signingEnabled
        });
    });
}

function getSigningTreasuryWallet(wallets, asset, network) {
    const normalizedAsset = String(asset || '').toUpperCase();
    const matches = wallets.filter(wallet =>
        wallet.asset === normalizedAsset &&
        wallet.network === network &&
        wallet.signingEnabled
    );

    if (matches.length !== 1) {
        const error = new Error(matches.length
            ? `Multiple signing treasury wallets are configured for ${normalizedAsset} on ${network}`
            : `No signing treasury wallet is configured for ${normalizedAsset} on ${network}`);
        error.code = 'TREASURY_WALLET_NOT_CONFIGURED';
        throw error;
    }

    return matches[0];
}

module.exports = { loadTreasuryWallets, getSigningTreasuryWallet };