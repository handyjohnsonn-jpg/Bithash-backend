const { ethers } = require('ethers');

function createSignerAdapter({ platformWallet }) {
  return {
    async sign({ scope, derivationPath, txRequest }) {
      if (!platformWallet || !derivationPath) throw Object.assign(new Error('Custody signer is not configured'), { statusCode: 503 });
      const privateKey = scope === 'treasury'
        ? platformWallet.getTreasuryPrivateKey(derivationPath, true)
        : platformWallet.getPrivateKey(derivationPath, true);
      // The key exists only in this stack frame and is never persisted or logged.
      return { signedTx: await new ethers.Wallet(privateKey).signTransaction(txRequest) };
    },
    async broadcast(signedTx, rpcUrl, chainId) {
      const tx = await new ethers.JsonRpcProvider(rpcUrl, chainId).broadcastTransaction(signedTx);
      return { txHash: tx.hash };
    }
  };
}

module.exports = { createSignerAdapter };
