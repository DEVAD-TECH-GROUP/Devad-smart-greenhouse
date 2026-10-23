import mongoose from 'mongoose';

// Mirrors the defaults in firmware/Config.h
export const DEFAULT_SETTINGS = {
  tempHigh: 34,
  tempHyst: 2,
  ldrBright: 1000,
  ldrDark: 1020,
  soilDry: 850,
  soilWet: 300,
  tankEmpty: 300,
  tankFilling: 400,
  topFull: 300,
  mistSec: 20,
  manualMaxMin: 10,
};

const settingsSchema = new mongoose.Schema(
  Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([k, v]) => [k, { type: Number, default: v }])),
  { _id: false }
);

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true, uppercase: true, trim: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    location: { type: String, trim: true, maxlength: 80, default: '' },
    settings: { type: settingsSchema, default: () => ({}) },
    online: { type: Boolean, default: false },
    lastSeenAt: Date,
    claimedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Device = mongoose.model('Device', deviceSchema);
