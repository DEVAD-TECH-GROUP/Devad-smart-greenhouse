import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['override', 'alert', 'system', 'settings'], required: true },
    level: { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
schema.index({ deviceId: 1, createdAt: -1 });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });

export const Activity = mongoose.model('Activity', schema);
