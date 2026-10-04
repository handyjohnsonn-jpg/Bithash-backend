// Wallet Management's public asset catalogue.  URLs are returned only by the
// authenticated admin API; private keys and provider credentials never appear
// here.
const ASSET_METADATA = {
  BTC: { name: 'Bitcoin', network: 'Bitcoin', networkId: 'BTC', decimals: 8, logoUrl: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png', type: 'utxo', rpcEnv: ['WALLET_MANAGEMENT_RPC_BITCOIN_URL', 'BITCOIN_RPC_URL'], indexerEnv: ['WALLET_MANAGEMENT_INDEXER_BITCOIN_URL'] },
  ETH: { name: 'Ethereum', network: 'Ethereum Mainnet', networkId: 'ETH', decimals: 18, logoUrl: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png', type: 'native' },
  USDT: { name: 'Tether USD', network: 'Ethereum Mainnet', networkId: 'ETH', decimals: 6, logoUrl: 'https://assets.coingecko.com/coins/images/325/large/Tether.png', type: 'erc20', contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
  USDC: { name: 'USD Coin', network: 'Ethereum Mainnet', networkId: 'ETH', decimals: 6, logoUrl: 'https://assets.coingecko.com/coins/images/6319/large/usd-coin.png', type: 'erc20', contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  SHIB: { name: 'Shiba Inu', network: 'Ethereum Mainnet', networkId: 'ETH', decimals: 18, logoUrl: 'https://assets.coingecko.com/coins/images/11939/large/shiba.png', type: 'erc20', contract: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE' },
  LINK: { name: 'Chainlink', network: 'Ethereum Mainnet', networkId: 'ETH', decimals: 18, logoUrl: 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png', type: 'erc20', contract: '0x514910771AF9Ca656af840dff83E8264EcF986CA' },
  UNI: { name: 'Uniswap', network: 'Ethereum Mainnet', networkId: 'ETH', decimals: 18, logoUrl: 'https://assets.coingecko.com/coins/images/12504/large/uniswap-logo.png', type: 'erc20', contract: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984' },
  WBTC: { name: 'Wrapped Bitcoin', network: 'Ethereum Mainnet', networkId: 'ETH', decimals: 8, logoUrl: 'https://assets.coingecko.com/coins/images/7598/large/wrapped_bitcoin_wbtc.png', type: 'erc20', contract: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' },
  DAI: { name: 'Dai Stablecoin', network: 'Ethereum Mainnet', networkId: 'ETH', decimals: 18, logoUrl: 'https://assets.coingecko.com/coins/images/9956/large/Badge_Dai.png', type: 'erc20', contract: '0x6B175474E89094C44Da98b954EedeAC495271d0F' },
  BNB: { name: 'BNB', network: 'BNB Smart Chain', networkId: 'BSC', decimals: 18, logoUrl: 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png', type: 'native' },
  MATIC: { name: 'Polygon', network: 'Polygon', networkId: 'POLYGON', decimals: 18, logoUrl: 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png', type: 'native' },
  AVAX: { name: 'Avalanche', network: 'Avalanche C-Chain', networkId: 'AVALANCHE', decimals: 18, logoUrl: 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite.png', type: 'native' },
  SOL: { name: 'Solana', network: 'Solana', networkId: 'SOL', decimals: 9, logoUrl: 'https://assets.coingecko.com/coins/images/4128/large/solana.png', type: 'solana', rpcEnv: ['WALLET_MANAGEMENT_RPC_SOLANA_URL', 'SOLANA_RPC_URL'], indexerEnv: ['WALLET_MANAGEMENT_INDEXER_SOLANA_URL'] },
  XRP: { name: 'XRP', network: 'XRP Ledger', networkId: 'XRP', decimals: 6, logoUrl: 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png', type: 'xrp', rpcEnv: ['WALLET_MANAGEMENT_RPC_XRP_URL', 'XRP_RPC_URL'], indexerEnv: ['WALLET_MANAGEMENT_INDEXER_XRP_URL'] },
  TRX: { name: 'TRON', network: 'TRON', networkId: 'TRX', decimals: 6, logoUrl: 'https://assets.coingecko.com/coins/images/1094/large/tron-logo.png', type: 'tron', rpcEnv: ['WALLET_MANAGEMENT_RPC_TRON_URL', 'TRON_RPC_URL'], indexerEnv: ['WALLET_MANAGEMENT_INDEXER_TRON_URL'] },
  ADA: { name: 'Cardano', network: 'Cardano', networkId: 'ADA', decimals: 6, logoUrl: 'https://assets.coingecko.com/coins/images/975/large/cardano.png', type: 'cardano', rpcEnv: ['WALLET_MANAGEMENT_RPC_CARDANO_URL', 'CARDANO_RPC_URL'], indexerEnv: ['WALLET_MANAGEMENT_INDEXER_CARDANO_URL'] },
  DOT: { name: 'Polkadot', network: 'Polkadot', networkId: 'DOT', decimals: 10, logoUrl: 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png', type: 'polkadot', rpcEnv: ['WALLET_MANAGEMENT_RPC_POLKADOT_URL', 'POLKADOT_RPC_URL'], indexerEnv: ['WALLET_MANAGEMENT_INDEXER_POLKADOT_URL'] },
  DOGE: { name: 'Dogecoin', network: 'Dogecoin', networkId: 'DOGE', decimals: 8, logoUrl: 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png', type: 'utxo', rpcEnv: ['WALLET_MANAGEMENT_RPC_DOGECOIN_URL', 'DOGECOIN_RPC_URL'], indexerEnv: ['WALLET_MANAGEMENT_INDEXER_DOGECOIN_URL'] },
  LTC: { name: 'Litecoin', network: 'Litecoin', networkId: 'LTC', decimals: 8, logoUrl: 'https://assets.coingecko.com/coins/images/2/large/litecoin.png', type: 'utxo', rpcEnv: ['WALLET_MANAGEMENT_RPC_LITECOIN_URL', 'LITECOIN_RPC_URL'], indexerEnv: ['WALLET_MANAGEMENT_INDEXER_LITECOIN_URL'] }
};

module.exports = { ASSET_METADATA };
