const express = require('express');
const mongoose = require('mongoose');
const { ethers } = require('ethers');

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address,uint256) returns (bool)'
];

const NETWORKS = {
  ETH: { id: 'ETH', name: 'Ethereum Mainnet', chainId: 1, nativeAsset: 'ETH', rpcEnv: ['WALLET_MANAGEMENT_RPC_ETHEREUM_URL', 'ETHEREUM_RPC_URL'] },
  BSC: { id: 'BSC', name: 'BNB Smart Chain', chainId: 56, nativeAsset: 'BNB', rpcEnv: ['WALLET_MANAGEMENT_RPC_BSC_URL', 'BSC_RPC_URL'] },
  POLYGON: { id: 'POLYGON', name: 'Polygon', chainId: 137, nativeAsset: 'MATIC', rpcEnv: ['WALLET_MANAGEMENT_RPC_POLYGON_URL', 'POLYGON_RPC_URL'] },
  ARBITRUM: { id: 'ARBITRUM', name: 'Arbitrum One', chainId: 42161, nativeAsset: 'ETH', rpcEnv: ['WALLET_MANAGEMENT_RPC_ARBITRUM_URL', 'ARBITRUM_RPC_URL'] },
  OPTIMISM: { id: 'OPTIMISM', name: 'Optimism', chainId: 10, nativeAsset: 'ETH', rpcEnv: ['WALLET_MANAGEMENT_RPC_OPTIMISM_URL', 'OPTIMISM_RPC_URL'] },
  BASE: { id: 'BASE', name: 'Base', chainId: 8453, nativeAsset: 'ETH', rpcEnv: ['WALLET_MANAGEMENT_RPC_BASE_URL', 'BASE_RPC_URL'] },
  AVALANCHE: { id: 'AVALANCHE', name: 'Avalanche C-Chain', chainId: 43114, nativeAsset: 'AVAX', rpcEnv: ['WALLET_MANAGEMENT_RPC_AVALANCHE_URL', 'AVALANCHE_RPC_URL'] }
};

const TOKENS = {
  ETH: {
    USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    SHIB: { address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', decimals: 18 },
    LINK: { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18 }
  }
};

const WalletRegistrySchema = new mongoose.Schema({
  address: { type: String, required: true, lowercase: true, trim: true },
  networkId: { type: String, required: true, uppercase: true, trim: true },
  asset: { type: String, required: true, uppercase: true, trim: true },
  role: { type: String, required: true, enum: ['deposit', 'treasury'], index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  label: { type: String, trim: true, maxlength: 200 },
  status: { type: String, enum: ['active', 'disabled'], default: 'active', index: true },
  watchOnly: { type: Boolean, default: true },
  signingEnabled: { type: Boolean, default: false },
  custodySignerRef: { type: String, select: false, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
}, { timestamps: true });
WalletRegistrySchema.index({ address: 1, networkId: 1, asset: 1, role: 1 }, { unique: true });

const WalletOperationSchema = new mongoose.Schema({
  idempotencyKey: { type: String, required: true, unique: true, index: true },
  operationType: { type: String, enum: ['transfer', 'withdraw', 'sweep'], required: true },
  wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletRegistry', required: true, index: true },
  networkId: { type: String, required: true }, asset: { type: String, required: true },
  amount: { type: String, required: true }, destinationAddress: { type: String, required: true },
  memo: String, notes: String, fee: { type: String }, feeAsset: String,
  status: { type: String, enum: ['prepared', 'approved', 'signing_pending', 'signed', 'broadcast', 'confirmed', 'failed', 'expired'], default: 'prepared', index: true },
  initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  approvedAt: Date, signedAt: Date, broadcastAt: Date, txHash: { type: String, index: true },
  expiresAt: { type: Date, required: true, index: true }, failureReason: String
}, { timestamps: true });
WalletOperationSchema.index({ status: 1, expiresAt: 1 });

const WalletRegistry = mongoose.models.WalletRegistry || mongoose.model('WalletRegistry', WalletRegistrySchema);
const WalletOperation = mongoose.models.WalletOperation || mongoose.model('WalletOperation', WalletOperationSchema);

function normalizeNetwork(value) {
  const input = String(value || '').toUpperCase();
  const aliases = { '0X1': 'ETH', '1': 'ETH', ETHEREUM: 'ETH', MATIC: 'POLYGON', AVAX: 'AVALANCHE', ARB: 'ARBITRUM', OP: 'OPTIMISM' };
  return aliases[input] || input;
}
function getNetwork(networkId) {
  return NETWORKS[normalizeNetwork(networkId)] || null;
}
function rpcUrl(network) {
  return network && network.rpcEnv.map(name => process.env[name]).find(Boolean);
}
function getProvider(networkId) {
  const network = getNetwork(networkId);
  const url = rpcUrl(network);
  if (!network) throw Object.assign(new Error('Unsupported network'), { statusCode: 400 });
  if (!url) throw Object.assign(new Error(`No RPC endpoint configured for ${network.id}`), { statusCode: 503 });
  return { network, provider: new ethers.JsonRpcProvider(url, network.chainId) };
}
function assetConfig(networkId, asset) {
  const network = getNetwork(networkId);
  if (!network) return null;
  const symbol = String(asset || '').toUpperCase();
  if (symbol === network.nativeAsset) return { symbol, native: true, decimals: 18 };
  const token = TOKENS[network.id]?.[symbol];
  return token ? { symbol, ...token, native: false } : null;
}
function publicWallet(wallet) {
  return {
    id: String(wallet._id), address: wallet.address, walletAddress: wallet.address,
    network: wallet.networkId, networkId: wallet.networkId, asset: wallet.asset, coin: wallet.asset,
    role: wallet.role, label: wallet.label, status: wallet.status, watchOnly: wallet.watchOnly,
    signingEnabled: wallet.signingEnabled, userId: wallet.user || null, createdAt: wallet.createdAt
  };
}
function depositModel() { return mongoose.models.Web3DepositAddress; }
function publicDeposit(wallet) {
  return { id: String(wallet._id), address: wallet.address, walletAddress: wallet.address,
    network: normalizeNetwork(wallet.network), networkId: normalizeNetwork(wallet.network), asset: wallet.asset,
    coin: wallet.asset, role: 'deposit', label: 'User deposit address', status: wallet.isActive ? 'active' : 'disabled',
    watchOnly: true, signingEnabled: false, userId: wallet.user || null, createdAt: wallet.createdAt };
}
async function findWallet(walletId) {
  const registry = await WalletRegistry.findById(walletId).lean();
  if (registry) return registry;
  const DepositAddress = depositModel();
  if (!DepositAddress) return null;
  const deposit = await DepositAddress.findById(walletId).lean();
  return deposit ? { _id: deposit._id, address: deposit.address, networkId: normalizeNetwork(deposit.network), asset: deposit.asset, role: 'deposit', status: deposit.isActive ? 'active' : 'disabled', watchOnly: true, signingEnabled: false, user: deposit.user, createdAt: deposit.createdAt } : null;
}
async function chainState(wallet) {
  if (!ethers.isAddress(wallet.address)) throw Object.assign(new Error('Registered wallet has an invalid EVM address'), { statusCode: 422 });
  const { network, provider } = getProvider(wallet.networkId);
  const asset = assetConfig(network.id, wallet.asset);
  if (!asset) throw Object.assign(new Error(`Unsupported asset ${wallet.asset} on ${network.id}`), { statusCode: 400 });
  const [blockNumber, nonce, nativeBalance] = await Promise.all([
    provider.getBlockNumber(), provider.getTransactionCount(wallet.address, 'pending'), provider.getBalance(wallet.address)
  ]);
  let balance = nativeBalance;
  if (!asset.native) {
    const token = new ethers.Contract(asset.address, ERC20_ABI, provider);
    balance = await token.balanceOf(wallet.address);
  }
  return {
    chainState: {
      balance: ethers.formatUnits(balance, asset.decimals), confirmedBalance: ethers.formatUnits(balance, asset.decimals),
      spendableBalance: ethers.formatUnits(balance, asset.decimals), unconfirmedBalance: null,
      transactionCount: nonce, pendingNonce: nonce, blockNumber, lastActivityAt: null,
      lastIncomingAt: null, lastOutgoingAt: null, fetchedAt: new Date().toISOString(), source: 'rpc'
    }
  };
}
function requireWalletPermission(req, res, next) {
  const permissions = req.admin?.permissions || [];
  if (req.admin?.role === 'super' || permissions.includes('all') || permissions.includes('wallet_management') || permissions.includes('wallet_operations')) return next();
  return res.status(403).json({ status: 'fail', message: 'Wallet Management permission is required' });
}
function fail(res, error) {
  const code = error.statusCode || 500;
  return res.status(code).json({ status: 'error', message: error.message || 'Wallet Management request failed' });
}
function page(value) { return Math.max(1, Number.parseInt(value, 10) || 1); }
function limit(value) { return Math.min(100, Math.max(1, Number.parseInt(value, 10) || 50)); }

function createWalletManagementRouter({ adminProtect, checkCSRF, getIO }) {
  const router = express.Router();
  router.use(adminProtect, requireWalletPermission);

  router.get('/networks', (req, res) => res.json({ status: 'success', data: { networks: Object.values(NETWORKS).filter(n => !!rpcUrl(n)).map(n => ({ id: n.id, networkId: n.id, name: n.name, chainId: n.chainId, nativeAsset: n.nativeAsset })) } }));
  router.get('/assets', (req, res) => {
    const network = getNetwork(req.query.network);
    if (!network) return res.status(400).json({ status: 'fail', message: 'Unsupported network' });
    const assets = [{ symbol: network.nativeAsset, id: network.nativeAsset, supportsOutgoing: true }].concat(Object.keys(TOKENS[network.id] || {}).map(symbol => ({ symbol, id: symbol, supportsOutgoing: true })));
    res.json({ status: 'success', data: { assets } });
  });
  router.get('/wallets', async (req, res) => {
    try {
      const filter = {};
      if (req.query.role) filter.role = req.query.role;
      if (req.query.network) filter.networkId = normalizeNetwork(req.query.network);
      if (req.query.asset) filter.asset = String(req.query.asset).toUpperCase();
      if (req.query.outgoing === 'true') { filter.role = 'treasury'; filter.status = 'active'; filter.signingEnabled = true; filter.watchOnly = false; }
      if (req.query.search) filter.$or = [{ address: new RegExp(String(req.query.search), 'i') }, { label: new RegExp(String(req.query.search), 'i') }];
      const currentPage = page(req.query.page), perPage = limit(req.query.limit);
      if (filter.role === 'deposit' && depositModel()) {
        const DepositAddress = depositModel();
        const depositFilter = { isActive: filter.status !== 'disabled' };
        if (filter.networkId) depositFilter.network = filter.networkId;
        if (filter.asset) depositFilter.asset = filter.asset;
        if (req.query.search) depositFilter.address = new RegExp(String(req.query.search), 'i');
        const [wallets, total] = await Promise.all([DepositAddress.find(depositFilter).sort({ createdAt: -1 }).skip((currentPage - 1) * perPage).limit(perPage).lean(), DepositAddress.countDocuments(depositFilter)]);
        return res.json({ status: 'success', data: { wallets: wallets.map(publicDeposit), page: currentPage, totalPages: Math.max(1, Math.ceil(total / perPage)), total } });
      }
      const [wallets, total] = await Promise.all([WalletRegistry.find(filter).sort({ createdAt: -1 }).skip((currentPage - 1) * perPage).limit(perPage).lean(), WalletRegistry.countDocuments(filter)]);
      res.json({ status: 'success', data: { wallets: wallets.map(publicWallet), page: currentPage, totalPages: Math.max(1, Math.ceil(total / perPage)), total } });
    } catch (error) { fail(res, error); }
  });
  router.get('/wallets/:walletId/state', async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.walletId)) return res.status(400).json({ status: 'fail', message: 'Invalid wallet identifier' });
      const wallet = await findWallet(req.params.walletId);
      if (!wallet) return res.status(404).json({ status: 'fail', message: 'Registered wallet not found' });
      res.json({ status: 'success', data: await chainState(wallet) });
    } catch (error) { fail(res, error); }
  });
  router.post('/fees/estimate', checkCSRF, async (req, res) => {
    try {
      const { walletId, networkId, asset, amount, destinationAddress } = req.body || {};
      if (!mongoose.isValidObjectId(walletId) || !ethers.isAddress(destinationAddress)) return res.status(400).json({ status: 'fail', message: 'A registered source wallet and valid destination address are required' });
      const wallet = await WalletRegistry.findById(walletId).lean();
      if (!wallet || wallet.role !== 'treasury' || !wallet.signingEnabled || wallet.watchOnly || wallet.status !== 'active') return res.status(403).json({ status: 'fail', message: 'Source wallet is not enabled for treasury operations' });
      if (normalizeNetwork(networkId) !== wallet.networkId || String(asset).toUpperCase() !== wallet.asset) return res.status(400).json({ status: 'fail', message: 'Source wallet network or asset does not match request' });
      const config = assetConfig(wallet.networkId, wallet.asset);
      if (!config || !amount || Number(amount) <= 0) return res.status(400).json({ status: 'fail', message: 'Unsupported asset or invalid amount' });
      const { provider, network } = getProvider(wallet.networkId);
      const units = ethers.parseUnits(String(amount), config.decimals);
      let request = { from: wallet.address, to: destinationAddress };
      if (config.native) request.value = units;
      else request.data = new ethers.Interface(ERC20_ABI).encodeFunctionData('transfer', [destinationAddress, units]);
      const [gasLimit, feeData, feeBalance] = await Promise.all([provider.estimateGas(request), provider.getFeeData(), provider.getBalance(wallet.address)]);
      const gasPrice = feeData.maxFeePerGas || feeData.gasPrice;
      if (!gasPrice) throw Object.assign(new Error('RPC did not return fee data'), { statusCode: 503 });
      const fee = gasLimit * gasPrice;
      res.json({ status: 'success', data: { gasFee: ethers.formatEther(fee), estimatedFee: ethers.formatEther(fee), feeAsset: network.nativeAsset, feeBalance: ethers.formatEther(feeBalance), gasLimit: gasLimit.toString(), source: 'rpc' } });
    } catch (error) { fail(res, error); }
  });
  router.post('/transactions/prepare', checkCSRF, async (req, res) => {
    try {
      const { walletId, networkId, asset, amount, destinationAddress, memo, notes, operationType = 'transfer' } = req.body || {};
      if (!mongoose.isValidObjectId(walletId) || !ethers.isAddress(destinationAddress) || !amount || Number(amount) <= 0) return res.status(400).json({ status: 'fail', message: 'Invalid transaction request' });
      const wallet = await WalletRegistry.findById(walletId);
      if (!wallet || wallet.role !== 'treasury' || !wallet.signingEnabled || wallet.watchOnly || wallet.status !== 'active') return res.status(403).json({ status: 'fail', message: 'Source wallet is not authorized for outgoing transfers' });
      if (wallet.networkId !== normalizeNetwork(networkId) || wallet.asset !== String(asset).toUpperCase()) return res.status(400).json({ status: 'fail', message: 'Source wallet does not match requested network and asset' });
      const config = assetConfig(wallet.networkId, wallet.asset);
      let requestedAmount;
      try { requestedAmount = ethers.parseUnits(String(amount), config.decimals); } catch (_) { return res.status(400).json({ status: 'fail', message: 'Invalid asset amount' }); }
      const state = await chainState(wallet.toObject());
      if (requestedAmount > ethers.parseUnits(state.chainState.spendableBalance, config.decimals)) return res.status(400).json({ status: 'fail', message: 'Amount exceeds live spendable balance' });
      const key = ethers.keccak256(ethers.toUtf8Bytes([wallet.id, req.admin.id, operationType, amount, destinationAddress.toLowerCase(), Date.now()].join(':')));
      const operation = await WalletOperation.create({ idempotencyKey: key, operationType, wallet: wallet._id, networkId: wallet.networkId, asset: wallet.asset, amount: String(amount), destinationAddress: destinationAddress.toLowerCase(), memo, notes, initiatedBy: req.admin._id, expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
      res.status(201).json({ status: 'success', data: { operationId: String(operation._id), id: String(operation._id), approvalRequired: true, status: operation.status, expiresAt: operation.expiresAt } });
    } catch (error) { fail(res, error); }
  });
  router.post('/transactions/:operationId/approve', checkCSRF, async (req, res) => {
    try {
      const operation = await WalletOperation.findById(req.params.operationId);
      if (!operation) return res.status(404).json({ status: 'fail', message: 'Operation not found' });
      if (operation.status === 'approved') return res.json({ status: 'success', data: { operationId: String(operation._id), status: operation.status } });
      if (operation.status !== 'prepared' || operation.expiresAt <= new Date()) return res.status(409).json({ status: 'fail', message: 'Operation is not eligible for approval' });
      operation.status = 'approved'; operation.approvedBy = req.admin._id; operation.approvedAt = new Date(); await operation.save();
      res.json({ status: 'success', data: { operationId: String(operation._id), status: operation.status } });
    } catch (error) { fail(res, error); }
  });
  router.post('/transactions/:operationId/sign', checkCSRF, async (req, res) => {
    try {
      const operation = await WalletOperation.findById(req.params.operationId).populate('wallet');
      if (!operation) return res.status(404).json({ status: 'fail', message: 'Operation not found' });
      if (operation.status !== 'approved' || operation.expiresAt <= new Date()) return res.status(409).json({ status: 'fail', message: 'Operation is not approved for signing' });
      // This application has no verified custody/KMS signer integration. Refusing to sign is intentional.
      return res.status(503).json({ status: 'error', message: 'No approved custody signer is configured; signing and broadcasting are disabled' });
    } catch (error) { fail(res, error); }
  });
  router.post('/transactions/:operationId/broadcast', checkCSRF, async (req, res) => res.status(409).json({ status: 'fail', message: 'Broadcast requires a transaction signed by an approved custody signer' }));
  router.get('/transactions', async (req, res) => {
    try {
      const filter = {}; ['networkId', 'asset', 'status'].forEach(key => { if (req.query[key] && req.query[key] !== 'all') filter[key === 'networkId' ? key : key] = key === 'asset' ? String(req.query[key]).toUpperCase() : req.query[key]; });
      if (req.query.network && req.query.network !== 'all') filter.networkId = normalizeNetwork(req.query.network);
      const currentPage = page(req.query.page), perPage = limit(req.query.limit);
      const [items, total] = await Promise.all([WalletOperation.find(filter).populate('wallet', 'address label').sort({ createdAt: -1 }).skip((currentPage - 1) * perPage).limit(perPage).lean(), WalletOperation.countDocuments(filter)]);
      res.json({ status: 'success', data: { transactions: items.map(item => ({ ...item, walletAddress: item.wallet?.address, platformWallet: item.wallet?.address, timestamp: item.createdAt, direction: 'outgoing', transactionType: item.operationType, fee: item.fee, feeAsset: item.feeAsset, txHash: item.txHash })), page: currentPage, totalPages: Math.max(1, Math.ceil(total / perPage)), networks: Object.keys(NETWORKS), assets: Object.keys(TOKENS.ETH || {}) } });
    } catch (error) { fail(res, error); }
  });
  router.get('/treasury/history', async (req, res) => {
    try {
      const currentPage = page(req.query.page), perPage = limit(req.query.limit);
      const [transfers, total] = await Promise.all([WalletOperation.find({}).sort({ createdAt: -1 }).skip((currentPage - 1) * perPage).limit(perPage).lean(), WalletOperation.countDocuments()]);
      res.json({ status: 'success', data: { transfers, page: currentPage, totalPages: Math.max(1, Math.ceil(total / perPage)), total } });
    } catch (error) { fail(res, error); }
  });
  router.get('/treasury/export', async (req, res) => {
    try {
      const filter = { role: 'treasury' };
      if (req.query.network) filter.networkId = normalizeNetwork(req.query.network);
      if (req.query.asset) filter.asset = String(req.query.asset).toUpperCase();
      const wallets = await WalletRegistry.find(filter).lean();
      res.json({ status: 'success', data: { wallets: wallets.map(publicWallet) } });
    } catch (error) { fail(res, error); }
  });
  router.get('/treasury', async (req, res) => {
    try {
      const wallets = await WalletRegistry.find({ role: 'treasury', status: 'active' }).lean();
      const groups = new Map();
      for (const wallet of wallets) {
        const key = `${wallet.networkId}:${wallet.asset}`; if (!groups.has(key)) groups.set(key, { network: wallet.networkId, asset: wallet.asset, available: 'Unavailable', pending: null, total: 'Unavailable', walletCount: 0, lastActivity: null, lastWithdrawal: null });
        const row = groups.get(key); row.walletCount += 1;
      }
      res.json({ status: 'success', data: { treasury: [...groups.values()] } });
    } catch (error) { fail(res, error); }
  });
  router.get('/reports-alerts', async (req, res) => res.json({ status: 'success', data: { alerts: [], totalPages: 1 } }));
  router.get('/dashboard', async (req, res) => {
    try {
      const [treasuryWalletCount, totalWalletAddresses, pendingTransactions, failedTransactions, activeNetworks, activity] = await Promise.all([
        WalletRegistry.countDocuments({ role: 'treasury' }), WalletRegistry.countDocuments(), WalletOperation.countDocuments({ status: { $in: ['prepared', 'approved', 'signing_pending', 'signed', 'broadcast'] } }), WalletOperation.countDocuments({ status: 'failed' }), WalletRegistry.distinct('networkId', { status: 'active' }), WalletOperation.find({}).sort({ createdAt: -1 }).limit(limit(req.query.limit || 10)).populate('wallet', 'address').lean()
      ]);
      const syncStates = Object.values(NETWORKS).map(network => ({ network: network.id, status: rpcUrl(network) ? 'configured' : 'unavailable', lastSuccessfulSyncAt: null, lastError: rpcUrl(network) ? null : 'RPC endpoint is not configured' }));
      res.json({ status: 'success', data: { treasuryWalletCount, totalWalletAddresses, fundedTreasuryWalletCount: 0, totalChainTransactions: await WalletOperation.countDocuments(), totalDepositsToday: 0, totalWithdrawalsToday: 0, totalCryptoReceived: 0, totalCryptoSent: 0, assetsUnderManagement: 0, pendingTransactions, failedTransactions, activeNetworks: activeNetworks.length, lastBlockchainSyncTime: null, lastSyncStatus: syncStates.some(s => s.status === 'configured') ? 'degraded' : 'error', syncStates, incomingVolume: 0, outgoingVolume: 0, depositsPerHour: { labels: [], values: [] }, depositsPerDay: { labels: [], values: [] }, networkDistribution: { labels: [], values: [] }, assetDistribution: { labels: [], values: [] }, largestDeposits: { labels: [], values: [] }, activity: activity.map(item => ({ time: item.createdAt, event: item.operationType, network: item.networkId, asset: item.asset, amount: item.amount, wallet: item.wallet?.address, status: item.status })) } });
    } catch (error) { fail(res, error); }
  });
  router.post('/sync', checkCSRF, async (req, res) => {
    try {
      const wallets = await WalletRegistry.find({ status: 'active' }).lean();
      const syncStates = await Promise.all(wallets.map(async wallet => {
        try { await chainState(wallet); return { walletId: String(wallet._id), network: wallet.networkId, status: 'healthy', lastSuccessfulSyncAt: new Date().toISOString() }; }
        catch (error) { return { walletId: String(wallet._id), network: wallet.networkId, status: 'unavailable', lastError: error.message }; }
      }));
      const io = getIO();
      const status = syncStates.length && syncStates.every(state => state.status === 'healthy') ? 'healthy' : 'degraded';
      if (io) io.to('wallet_management_admins').emit('wallet_management_sync_status', { status, message: 'Blockchain reconciliation completed', syncStates, lastSuccessfulSyncAt: syncStates.some(state => state.status === 'healthy') ? new Date().toISOString() : null });
      res.json({ status: 'success', data: { syncStates } });
    } catch (error) { fail(res, error); }
  });
  return router;
}

function bindWalletManagementSocket(socket, { Admin }) {
  socket.on('subscribe_wallet_management', async () => {
    try {
      if (!socket.isAuthenticated || !socket.isAdmin || !socket.userId) return socket.emit('wallet_management_error', { message: 'Admin authentication is required' });
      const admin = await Admin.findById(socket.userId).lean();
      const permissions = admin?.permissions || [];
      if (!admin || !(admin.role === 'super' || permissions.includes('all') || permissions.includes('wallet_management') || permissions.includes('wallet_operations'))) return socket.emit('wallet_management_error', { message: 'Wallet Management permission is required' });
      socket.join('wallet_management_admins');
      const syncStates = Object.values(NETWORKS).map(network => ({ network: network.id, status: rpcUrl(network) ? 'configured' : 'unavailable', lastSuccessfulSyncAt: null }));
      socket.emit('wallet_management_initial', { syncStates, lastSuccessfulSyncAt: null });
    } catch (error) { socket.emit('wallet_management_error', { message: 'Unable to authorize Wallet Management subscription' }); }
  });
  socket.on('unsubscribe_wallet_management', () => socket.leave('wallet_management_admins'));
}

module.exports = { createWalletManagementRouter, bindWalletManagementSocket };
