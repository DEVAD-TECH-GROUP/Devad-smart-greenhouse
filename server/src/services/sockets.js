import { Server } from 'socket.io';
import { config } from '../config.js';
import { verifyAccessToken } from '../middleware/auth.js';
import { Device } from '../models/Device.js';

let io = null;

export function initSockets(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: config.clientOrigin, credentials: true },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const mine = await Device.find({ owner: socket.data.userId }).select('deviceId');
    mine.forEach((d) => socket.join(`device:${d.deviceId}`));

    // Called by the client right after claiming a new device
    socket.on('subscribe', async (deviceId, ack) => {
      const dev = await Device.exists({ deviceId: String(deviceId).toUpperCase(), owner: socket.data.userId });
      if (dev) socket.join(`device:${String(deviceId).toUpperCase()}`);
      if (typeof ack === 'function') ack({ ok: !!dev });
    });
  });

  return io;
}

export function emitToDevice(deviceId, event, payload) {
  if (io) io.to(`device:${deviceId}`).emit(event, payload);
}
