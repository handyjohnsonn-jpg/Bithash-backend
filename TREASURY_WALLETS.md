# Treasury Wallet Configuration

Wallet Management uses explicitly configured platform treasury wallets. An empty configuration is valid and disables treasury balances, transaction indexing, and outgoing transfers. Existing user `DepositAddress` documents are never imported as treasury wallets.

## Configuration

Set these backend-only environment variables:

- `TREASURY_MASTER_SEED_PHRASE`: a treasury-specific BIP-39 phrase. Do not reuse `MASTER_SEED_PHRASE`; the latter remains the user deposit-wallet root.
- `TREASURY_WALLETS_JSON`: JSON array of treasury wallet entries.

Each entry has this shape (the values below are placeholders, not deployable addresses):

```json
[
  {
    "id": "eth-main-treasury",
    "asset": "ETH",
    "network": "ETH",
    "address": "<derived-treasury-address>",
    "derivationPath": "<unique-treasury-derivation-path>",
    "signingEnabled": true
  }
]
```

Asset and network values must match `ASSET_NETWORK_MAP`. The backend derives each configured address from `TREASURY_MASTER_SEED_PHRASE` and verifies the result at startup. Treasury addresses and derivation paths that overlap a user deposit record on the same network are rejected. At most one signing wallet may be enabled for an asset/network pair; any number of additional explicitly configured wallets may be read-only (`signingEnabled: false`). The backend, not the browser, chooses the signing wallet.

Provision treasury addresses from the separate treasury seed, fund them, and configure the resulting public addresses and paths through the deployment secret/configuration store. Do not put the seed phrase or derived private keys in `admin.html`, source control, or browser storage. This code uses server-side HD derivation; it does not provide HSM/KMS signing.

## Chain History Providers

The configured assets and networks remain those in `ASSET_NETWORK_MAP`. The indexer polls every 30 seconds, persists a cursor per configured wallet, and stores deduplicated chain activity in `TreasuryChainTransaction`.

| Chain family | History and balance source | Required configuration / notes |
| --- | --- | --- |
| Ethereum, BNB Smart Chain, Polygon, Avalanche | Existing Etherscan-compatible explorer API plus the configured JSON-RPC endpoint; native transactions and the configured ERC-20 contract transfer history are indexed | Existing `ETHERSCAN_API_KEY`, `BSCSCAN_API_KEY`, `POLYGONSCAN_API_KEY`, and `SNOWTRACE_API_KEY` settings; `EVM_EXPLORER_API_URL` can override the API URL |
| Bitcoin, Dogecoin, Litecoin | Existing Blockchair address and transaction APIs; recent confirmed records are rechecked for reorganizations | Public Blockchair endpoint currently used by the application; subject to its availability and rate limits |
| Solana | Existing Solana JSON-RPC signature history and parsed transaction endpoints | `SOLANA_RPC_URL`; the configured asset map currently includes SOL, not SPL assets |
| TRON | Existing TronGrid account transaction API for native TRX | `TRON_RPC_URL`; `TRONGRID_API_KEY` is recommended for production quotas |
| XRP Ledger | XRPL `account_tx` history and validated-ledger status | `XRP_HISTORY_RPC_URL` (defaults to `wss://xrplcluster.com`) |
| Cardano | Existing Blockfrost address transaction and UTXO APIs | `BLOCKFROST_API_KEY` is required |
| Polkadot | Subscan transfer history | `SUBSCAN_API_KEY` is required; this application has no archive RPC history source configured |

The backend records provider errors as per-wallet sync errors and does not update the successful sync timestamp for a failed wallet. EVM block hashes and recent UTXO transaction visibility are rechecked for reorganizations. Confirmations use chain/provider status and configured `TREASURY_CONFIRMATIONS_<NETWORK>` overrides where supported.

These are polling/indexer integrations, not universal mempool subscriptions. Explorer APIs may expose a transaction only after it is mined/indexed; pending mempool visibility and indexing latency depend on each provider. A provider outage or missing required credential is surfaced as an unhealthy sync state rather than a fabricated balance or timestamp.

## Authorization And Transfers

External destinations are retained because the existing Treasury UI explicitly provides transfer and withdrawal forms with destination-address inputs. The Wallet Management POST routes require `adminProtect` and the `super` or `finance` role, validate the asset/network pair and address format server-side, and derive the signer only from the configured treasury wallet. Any submitted source address is ignored. The existing signing builder implements EVM, Solana, UTXO, and TRON; XRP, Cardano, and Polkadot remain read-only in Treasury until their existing signing implementation is extended. User-deposit sweep endpoints return `410 Gone`.

Socket.IO treasury events require an admin JWT and a fresh database role check (`super` or `finance`). Events are emitted only to the treasury-admin room. The manual sync API has the same HTTP authorization.