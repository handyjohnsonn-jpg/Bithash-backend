const mongoose = require('mongoose');
const Schema = new mongoose.Schema({
  txHash:         { type: String, required: true, unique: true, index: true },
  network:        { type: String, index: true },
  asset:          { type: String, index: true, uppercase: true },
  direction:      { type: String, enum: ['incoming','outgoing'], index: true },
  fromAddress:    { type: String, index: true },
  toAddress:      { type: String, index: true },
  amount:         { type: String },
  gasFee:         { type: String },
  feeAsset:       { type: String },
  blockNumber:    { type: Number, index: true },
  confirmations:  { type: Number, default: 0, index: true },
  status:         { type: String, enum: ['pending','confirmed','failed','stuck','dropped','replaced'], default: 'pending', index: true },
  timestamp:      { type: Date, index: true },
  platformWallet: { type: String },
  assignedUser:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  raw:            { type: Object },
}, { timestamps: true, collection: 'wallet_transactions' });
module.exports = mongoose.models.WalletTransaction || mongoose.model('WalletTransaction', Schema);
