'use strict';

const axios = require('axios');
const { ethers } = require('ethers');
const { Connection, PublicKey } = require('@solana/web3.js');
const TronWeb = require('tronweb').default || require('tronweb');
const xrpl = require('xrpl');

const EXPLORER_NETWORKS = {
    ETH: ['ETHERSCAN_API_KEY', 1],
    BSC: ['BSCSCAN_API_KEY', 56],
    POLYGON: ['POLYGONSCAN_API_KEY', 137],
    AVALANCHE: ['SNOWTRACE_API_KEY', 43114]
};

const REQUIRED_CONFIRMATIONS = {
    BTC: 3,
    ETH: 12,
    BSC: 15,
    POLYGON: 30,
    AVALANCHE: 15,
    SOLANA: 32,
    TRON: 19,
    XRP: 4,
    DOGE: 6,
    LTC: 6,
    ADA: 15,
    DOT: 10
};

function confirmationsRequired(wallet) {
    return Number(process.env[`TREASURY_CONFIRMATIONS_${wallet.network}`] || REQUIRED_CONFIRMATIONS[wallet.network] || 12);
}

function unitsToDecimal(value, decimals) {
    const raw = BigInt(value || 0).toString().padStart(decimals + 1, '0');
    const whole = raw.slice(0, -decimals) || '0';
    const fraction = raw.slice(-decimals).replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole;
}

function directionFor(walletAddress, fromAddress, toAddress, caseInsensitive = false) {
    const normalize = value => caseInsensitive ? String(value || '').toLowerCase() : String(value || '');
    const wallet = normalize(walletAddress);
    const from = normalize(fromAddress);
    const to = normalize(toAddress);
    if (from === wallet && to === wallet) return 'self';
    if (to === wallet) return 'incoming';
    return 'outgoing';
}

function makeRecord(wallet, values) {
    return {
        walletId: wallet.id,
        walletAddress: wallet.address,
        network: wallet.network,
        chainId: wallet.chainId,
        asset: wallet.asset,
        txHash: String(values.txHash),
        eventIndex: String(values.eventIndex ?? 'native'),
        direction: values.direction,
        fromAddress: String(values.fromAddress || ''),
        toAddress: String(values.toAddress || ''),
        amount: String(values.amount || '0'),
        tokenContract: values.tokenContract || null,
        blockNumber: values.blockNumber == null ? null : Number(values.blockNumber),
        blockHash: values.blockHash || null,
        timestamp: values.timestamp ? new Date(values.timestamp) : null,
        confirmations: Number(values.confirmations || 0),
        status: values.status || 'pending',
        explorerUrl: values.explorerUrl || null
    };
}

async function fetchEvm(wallet, assetConfig, cursor, configuredApiKey) {
    const [keyName, chainId] = EXPLORER_NETWORKS[wallet.network] || [];
    const apiKey = configuredApiKey || (keyName && (process.env[keyName] || process.env.ETHERSCAN_API_KEY));
    if (!apiKey) throw new Error(`No EVM explorer API key configured for ${wallet.network}`);
    if (Number(chainId) !== Number(wallet.chainId)) throw new Error(`No explorer mapping for chain ${wallet.chainId}`);

    const provider = new ethers.JsonRpcProvider(assetConfig.rpc);
    const currentBlock = await provider.getBlockNumber();
    const token = Boolean(assetConfig.contract);
    const fetchPage = async page => {
        const params = {
            chainid: wallet.chainId,
            module: 'account',
            action: token ? 'tokentx' : 'txlist',
            address: wallet.address,
            startblock: 0,
            endblock: currentBlock,
            page,
            offset: 1000,
            sort: 'desc',
            apikey: apiKey
        };
        if (token) params.contractaddress = assetConfig.contract;
        const response = await axios.get(process.env.EVM_EXPLORER_API_URL || 'https://api.etherscan.io/v2/api', {
            params,
            timeout: 20000
        });
        const payload = response.data;
        if (payload?.status === '0' && !/no transactions found/i.test(String(payload.message || payload.result))) {
            throw new Error(`EVM explorer rejected ${wallet.network} history request: ${payload.message || payload.result}`);
        }
        return Array.isArray(payload?.result) ? payload.result : [];
    };
    const backfillPage = Number(cursor?.backfillPage || 1);
    const headRows = await fetchPage(1);
    const backfillRows = backfillPage > 1 ? await fetchPage(backfillPage) : [];
    const rows = [...headRows, ...backfillRows];

    const required = confirmationsRequired(wallet);
    const items = rows.map(row => {
        const blockNumber = Number(row.blockNumber);
        const confirmations = Math.max(0, currentBlock - blockNumber + 1);
        const amount = token
            ? unitsToDecimal(row.value, Number(row.tokenDecimal || 18))
            : unitsToDecimal(row.value, 18);
        return makeRecord(wallet, {
            txHash: row.hash,
            eventIndex: token ? row.logIndex : 'native',
            direction: directionFor(wallet.address, row.from, row.to, true),
            fromAddress: row.from,
            toAddress: row.to,
            amount,
            tokenContract: token ? row.contractAddress : null,
            blockNumber,
            blockHash: row.blockHash,
            timestamp: Number(row.timeStamp) * 1000,
            confirmations,
            status: row.isError === '1' || row.txreceipt_status === '0'
                ? 'failed'
                : confirmations >= required ? 'confirmed' : 'pending',
            explorerUrl: `${assetConfig.explorer || ''}${row.hash}`
        });
    });

    const cursorPage = backfillPage === 1 ? 2 : backfillPage + 1;
    return { items, cursor: backfillRows.length === 1000 || (backfillPage === 1 && headRows.length === 1000)
        ? { backfillPage: cursorPage }
        : { backfillPage: 1 } };
}

async function fetchUtxo(wallet, assetConfig, cursor) {
    const chains = { BTC: 'bitcoin', DOGE: 'dogecoin', LTC: 'litecoin' };
    const chain = chains[wallet.asset];
    if (!chain) throw new Error(`No UTXO history adapter for ${wallet.asset}`);
    const fetchHashes = async offset => {
        const response = await axios.get(`https://api.blockchair.com/${chain}/dashboards/address/${encodeURIComponent(wallet.address)}`, {
            params: { transaction_details: true, limit: 20, offset },
            timeout: 20000
        });
        return response.data?.data?.[wallet.address]?.transactions || [];
    };
    const backfillOffset = Number(cursor?.backfillOffset || 0);
    const headHashes = await fetchHashes(0);
    const backfillHashes = backfillOffset > 0 ? await fetchHashes(backfillOffset) : [];
    const hashes = [...new Set([...headHashes, ...backfillHashes])];
    const items = [];
    const divisor = 1e8;

    for (const hash of hashes.slice(0, 20)) {
        const txResponse = await axios.get(`https://api.blockchair.com/${chain}/dashboards/transaction/${hash}`, { timeout: 20000 });
        const tx = txResponse.data?.data?.[hash];
        if (!tx) continue;
        const inputs = tx.inputs || [];
        const outputs = tx.outputs || [];
        const received = outputs.filter(output => output.recipient === wallet.address)
            .reduce((sum, output) => sum + Number(output.value || 0), 0);
        const spent = inputs.filter(input => input.recipient === wallet.address)
            .reduce((sum, input) => sum + Number(input.value || 0), 0);
        const net = received - spent;
        if (!net) continue;
        const firstInput = inputs[0]?.recipient || '';
        const firstOutput = outputs[0]?.recipient || '';
        const confirmations = Number(tx.confirmations || 0);
        const required = confirmationsRequired(wallet);
        items.push(makeRecord(wallet, {
            txHash: hash,
            direction: net > 0 ? 'incoming' : 'outgoing',
            fromAddress: spent > 0 ? wallet.address : firstInput,
            toAddress: received > 0 ? wallet.address : firstOutput,
            amount: (Math.abs(net) / divisor).toString(),
            blockNumber: tx.block_id || null,
            blockHash: tx.block_hash || null,
            timestamp: tx.time,
            confirmations,
            status: confirmations >= required ? 'confirmed' : 'pending',
            explorerUrl: `${assetConfig.explorer || ''}${hash}`
        }));
    }

    const nextOffset = backfillOffset === 0 ? 20 : backfillOffset + 20;
    return { items, cursor: backfillHashes.length === 20 || (backfillOffset === 0 && headHashes.length === 20)
        ? { backfillOffset: nextOffset }
        : { backfillOffset: 0 } };
}

async function fetchSolana(wallet, assetConfig, cursor) {
    const connection = new Connection(assetConfig.rpc, 'confirmed');
    const publicKey = new PublicKey(wallet.address);
    const headSignatures = await connection.getSignaturesForAddress(publicKey, { limit: 1000 }, 'confirmed');
    const backfillSignatures = cursor?.before
        ? await connection.getSignaturesForAddress(publicKey, { limit: 1000, before: cursor.before }, 'confirmed')
        : [];
    const signatures = [...new Map([...headSignatures, ...backfillSignatures].map(item => [item.signature, item])).values()];
    const items = [];
    for (const signatureInfo of signatures) {
        const transaction = await connection.getParsedTransaction(signatureInfo.signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
        });
        if (!transaction) continue;
        const keys = transaction.transaction.message.accountKeys;
        const walletIndex = keys.findIndex(key => (key.pubkey || key).toBase58() === wallet.address);
        const pre = transaction.meta?.preBalances?.[walletIndex] || 0;
        const post = transaction.meta?.postBalances?.[walletIndex] || 0;
        const delta = post - pre;
        const status = signatureInfo.err ? 'failed'
            : signatureInfo.confirmationStatus === 'finalized' ? 'confirmed' : 'pending';
        items.push(makeRecord(wallet, {
            txHash: signatureInfo.signature,
            direction: delta >= 0 ? 'incoming' : 'outgoing',
            fromAddress: delta < 0 ? wallet.address : '',
            toAddress: delta > 0 ? wallet.address : '',
            amount: (Math.abs(delta) / 1e9).toString(),
            blockNumber: signatureInfo.slot,
            timestamp: signatureInfo.blockTime ? signatureInfo.blockTime * 1000 : null,
            confirmations: status === 'confirmed' ? 32 : 0,
            status,
            explorerUrl: `${assetConfig.explorer || ''}${signatureInfo.signature}`
        }));
    }
    const nextBefore = backfillSignatures.length === 1000
        ? backfillSignatures[backfillSignatures.length - 1].signature
        : !cursor?.before && headSignatures.length === 1000 ? headSignatures[headSignatures.length - 1].signature : null;
    return { items, cursor: nextBefore ? { before: nextBefore } : null };
}

async function fetchTron(wallet, assetConfig, cursor) {
    const fetchPage = async fingerprint => {
        const params = { limit: 200, order_by: 'block_timestamp,desc', only_confirmed: false };
        if (fingerprint) params.fingerprint = fingerprint;
        const response = await axios.get(`${assetConfig.rpc}/v1/accounts/${encodeURIComponent(wallet.address)}/transactions`, {
            params,
            headers: process.env.TRONGRID_API_KEY ? { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY } : {},
            timeout: 20000
        });
        return response.data;
    };
    const head = await fetchPage(null);
    const backfill = cursor?.fingerprint ? await fetchPage(cursor.fingerprint) : null;
    const rows = [...new Map([...(head.data || []), ...(backfill?.data || [])].map(row => [row.txID, row])).values()];
    const items = rows.flatMap(row => {
        const contract = row.raw_data?.contract?.[0];
        const transfer = contract?.parameter?.value;
        if (!transfer || !transfer.to_address || transfer.amount == null) return [];
        const from = new TronWeb({ fullHost: assetConfig.rpc }).address.fromHex(transfer.owner_address);
        const to = new TronWeb({ fullHost: assetConfig.rpc }).address.fromHex(transfer.to_address);
        const confirmations = row.confirmed ? Number(process.env.TREASURY_CONFIRMATIONS_TRON || 19) : 0;
        return [makeRecord(wallet, {
            txHash: row.txID,
            direction: directionFor(wallet.address, from, to),
            fromAddress: from,
            toAddress: to,
            amount: (Number(transfer.amount) / 1e6).toString(),
            blockNumber: row.blockNumber || null,
            blockHash: row.block_hash || null,
            timestamp: row.block_timestamp,
            confirmations,
            status: row.ret?.[0]?.contractRet === 'SUCCESS'
                ? row.confirmed ? 'confirmed' : 'pending'
                : 'failed',
            explorerUrl: `${assetConfig.explorer || ''}${row.txID}`
        })];
    });
    const nextFingerprint = backfill?.meta?.fingerprint || (!cursor?.fingerprint ? head.meta?.fingerprint : null);
    return { items, cursor: nextFingerprint ? { fingerprint: nextFingerprint } : null };
}

async function fetchXrp(wallet, assetConfig, cursor) {
    const url = process.env.XRP_HISTORY_RPC_URL || 'wss://xrplcluster.com';
    const client = new xrpl.Client(url);
    await client.connect();
    try {
        const request = {
            command: 'account_tx',
            account: wallet.address,
            ledger_index_min: -1,
            ledger_index_max: -1,
            limit: 200,
            forward: false
        };
        const headResponse = await client.request(request);
        const backfillResponse = cursor?.marker
            ? await client.request({ ...request, marker: cursor.marker })
            : null;
        const transactions = [...new Map([
            ...(headResponse.result.transactions || []),
            ...(backfillResponse?.result.transactions || [])
        ].map(entry => {
            const tx = entry.tx || entry.tx_json || {};
            return [tx.hash || entry.hash, entry];
        })).values()];
        const items = transactions.map(entry => {
            const tx = entry.tx || entry.tx_json || {};
            const amountValue = typeof tx.Amount === 'string' ? Number(tx.Amount) / 1e6 : 0;
            const direction = directionFor(wallet.address, tx.Account, tx.Destination);
            const transactionResult = entry.meta?.TransactionResult || entry.metaData?.TransactionResult;
            return makeRecord(wallet, {
                txHash: tx.hash || entry.hash,
                direction,
                fromAddress: tx.Account,
                toAddress: tx.Destination,
                amount: amountValue,
                blockNumber: entry.ledger_index,
                timestamp: tx.date ? (tx.date + 946684800) * 1000 : null,
                confirmations: entry.validated ? Number(process.env.TREASURY_CONFIRMATIONS_XRP || 4) : 0,
                status: transactionResult && !transactionResult.startsWith('tes') ? 'failed' : entry.validated ? 'confirmed' : 'pending',
                explorerUrl: `${assetConfig.explorer || ''}${tx.hash || entry.hash}`
            });
        }).filter(item => item.txHash);
        const nextMarker = backfillResponse?.result.marker || (!cursor?.marker ? headResponse.result.marker : null);
        return { items, cursor: nextMarker ? { marker: nextMarker } : null };
    } finally {
        await client.disconnect();
    }
}

async function fetchCardano(wallet, assetConfig, cursor) {
    const apiKey = process.env.BLOCKFROST_API_KEY;
    if (!apiKey) throw new Error('BLOCKFROST_API_KEY is required for Cardano treasury history');
    const headers = { project_id: apiKey };
    const fetchPage = async page => {
        const response = await axios.get(`https://cardano-mainnet.blockfrost.io/api/v0/addresses/${encodeURIComponent(wallet.address)}/transactions`, {
            params: { count: 100, page, order: 'desc' }, headers, timeout: 20000
        });
        return response.data || [];
    };
    const backfillPage = Number(cursor?.page || 1);
    const headRows = await fetchPage(1);
    const backfillRows = backfillPage > 1 ? await fetchPage(backfillPage) : [];
    const rows = [...new Map([...headRows, ...backfillRows].map(row => [row.tx_hash, row])).values()];
    const tipResponse = await axios.get('https://cardano-mainnet.blockfrost.io/api/v0/blocks/latest', { headers, timeout: 20000 });
    const tipHeight = Number(tipResponse.data?.height || 0);
    const required = confirmationsRequired(wallet);
    const items = [];

    for (const row of rows) {
        const [utxosResponse, transactionResponse] = await Promise.all([
            axios.get(`https://cardano-mainnet.blockfrost.io/api/v0/txs/${row.tx_hash}/utxos`, { headers, timeout: 20000 }),
            axios.get(`https://cardano-mainnet.blockfrost.io/api/v0/txs/${row.tx_hash}`, { headers, timeout: 20000 })
        ]);
        const inputs = utxosResponse.data?.inputs || [];
        const outputs = utxosResponse.data?.outputs || [];
        const received = outputs.filter(output => output.address === wallet.address)
            .flatMap(output => output.amount || [])
            .filter(amount => amount.unit === 'lovelace')
            .reduce((sum, amount) => sum + BigInt(amount.quantity || 0), 0n);
        const spent = inputs.filter(input => input.address === wallet.address)
            .flatMap(input => input.amount || [])
            .filter(amount => amount.unit === 'lovelace')
            .reduce((sum, amount) => sum + BigInt(amount.quantity || 0), 0n);
        const delta = received - spent;
        if (delta === 0n) continue;
        const confirmations = Math.max(0, tipHeight - Number(row.block_height || 0) + 1);
        items.push(makeRecord(wallet, {
            txHash: row.tx_hash,
            eventIndex: row.tx_index,
            direction: delta > 0n ? 'incoming' : 'outgoing',
            fromAddress: spent > 0n ? wallet.address : '',
            toAddress: received > 0n ? wallet.address : '',
            amount: unitsToDecimal(delta > 0n ? delta : -delta, 6),
            blockNumber: row.block_height,
            blockHash: transactionResponse.data?.block,
            timestamp: transactionResponse.data?.block_time ? transactionResponse.data.block_time * 1000 : null,
            confirmations,
            status: confirmations >= required ? 'confirmed' : 'pending',
            explorerUrl: `${assetConfig.explorer || ''}${row.tx_hash}`
        }));
    }
    const nextPage = backfillPage === 1 ? 2 : backfillPage + 1;
    return { items, cursor: backfillRows.length === 100 || (backfillPage === 1 && headRows.length === 100)
        ? { page: nextPage }
        : { page: 1 } };
}

async function fetchPolkadot(wallet, assetConfig, cursor) {
    const apiKey = process.env.SUBSCAN_API_KEY;
    if (!apiKey) throw new Error('SUBSCAN_API_KEY is required for Polkadot treasury history');
    const fetchPage = async page => {
        const response = await axios.post(process.env.SUBSCAN_TRANSFERS_URL || 'https://polkadot.api.subscan.io/api/scan/transfers', {
            address: wallet.address,
            row: 100,
            page
        }, {
            headers: { 'X-API-Key': apiKey },
            timeout: 20000
        });
        if (response.data?.code !== 0) throw new Error(`Subscan history request failed: ${response.data?.message || 'unknown error'}`);
        return response.data?.data?.transfers || [];
    };
    const backfillPage = Number(cursor?.page || 0);
    const headRows = await fetchPage(0);
    const backfillRows = backfillPage > 0 ? await fetchPage(backfillPage) : [];
    const rows = [...new Map([...headRows, ...backfillRows]
        .map(row => [`${row.hash || row.extrinsic_hash}:${row.event_id || row.extrinsic_index}`, row])).values()];
    const items = rows.map(row => makeRecord(wallet, {
        txHash: row.hash || row.extrinsic_hash,
        eventIndex: row.event_id || row.extrinsic_index,
        direction: directionFor(wallet.address, row.from, row.to),
        fromAddress: row.from,
        toAddress: row.to,
        amount: unitsToDecimal(row.amount || 0, 10),
        blockNumber: row.block_num,
        timestamp: row.block_timestamp ? Number(row.block_timestamp) * 1000 : null,
        confirmations: 0,
        status: 'confirmed',
        explorerUrl: `${assetConfig.explorer || ''}${row.hash || row.extrinsic_hash}`
    })).filter(item => item.txHash);
    const nextPage = backfillPage === 0 ? 1 : backfillPage + 1;
    return { items, cursor: backfillRows.length === 100 || (backfillPage === 0 && headRows.length === 100)
        ? { page: nextPage }
        : { page: 0 } };
}

async function fetchTreasuryHistory(wallet, assetConfig, cursor, options = {}) {
    switch (wallet.type) {
        case 'evm': return fetchEvm(wallet, assetConfig, cursor, options.explorerApiKey);
        case 'utxo': return fetchUtxo(wallet, assetConfig, cursor);
        case 'solana': return fetchSolana(wallet, assetConfig, cursor);
        case 'tron': return fetchTron(wallet, assetConfig, cursor);
        case 'xrp': return fetchXrp(wallet, assetConfig, cursor);
        case 'cardano': return fetchCardano(wallet, assetConfig, cursor);
        case 'polkadot': return fetchPolkadot(wallet, assetConfig, cursor);
        default: throw new Error(`No treasury history adapter for ${wallet.type}`);
    }
}

module.exports = { fetchTreasuryHistory, unitsToDecimal };