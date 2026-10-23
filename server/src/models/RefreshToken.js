import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  userAgent: String,
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // auto-delete expired tokens

export const RefreshToken = mongoose.model('RefreshToken', schema);
