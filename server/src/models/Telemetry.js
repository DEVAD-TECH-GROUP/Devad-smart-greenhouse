import mongoose from 'mongoose';
import { config } from '../config.js';

const schema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true },
    ts: { type: Date, required: true },
    temp: Number,
    hum: Number,
    soil: Number,
    ldr: Number,
    lowRaw: Number,
    highRaw: Number,
    tank: String,
    out: { type: mongoose.Schema.Types.Mixed },
  },
  { versionKey: false }
);
schema.index({ deviceId: 1, ts: -1 });
schema.index({ ts: 1 }, { expireAfterSeconds: config.retentionDays * 86400 });

export const Telemetry = mongoose.model('Telemetry', schema);
