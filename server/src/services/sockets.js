import { Server } from 'socket.io';
import { config } from '../config.js';
import { verifyAccessToken } from '../middleware/auth.js';
import { Device } from '../models/Device.js';

let io = null;

export function initSockets(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: config.clientOrigin,
      credentials: true,
    },
  });

  // Authenticate every socket connection.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error('unauthorized'));
      }

      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;

      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.data.userId;

    // This room lets us remove all of this user's active
    // connections from a greenhouse when access is revoked.
    socket.join(`user:${userId}`);

    try {
      // Owners and viewers may receive live greenhouse updates.
      const devices = await Device.find({
        $or: [
          { owner: userId },
          { 'viewers.user': userId },
        ],
      }).select('deviceId');

      // Check that the socket has not disconnected while querying.
      if (!socket.connected) return;

      devices.forEach((device) => {
        socket.join(`device:${device.deviceId}`);
      });
    } catch (error) {
      console.error('Could not load socket greenhouse access:', error);
    }

    // Clients may subscribe after claiming a greenhouse.
    // Always check current database access before joining.
    socket.on('subscribe', async (deviceId, ack) => {
      try {
        const normalizedId = String(deviceId).toUpperCase();

        const device = await Device.exists({
          deviceId: normalizedId,
          $or: [
            { owner: userId },
            { 'viewers.user': userId },
          ],
        });

        if (device) {
          socket.join(`device:${normalizedId}`);
        } else {
          socket.leave(`device:${normalizedId}`);
        }

        if (typeof ack === 'function') {
          ack({ ok: Boolean(device) });
        }
      } catch (error) {
        console.error('Socket subscription failed:', error);

        if (typeof ack === 'function') {
          ack({ ok: false });
        }
      }
    });
  });

  return io;
}

// Remove all active connections for a user from one greenhouse.
// The user's access to other greenhouses is unaffected.
export function removeUserFromDevice(userId, deviceId) {
  if (!io) return;

  io.in(`user:${userId}`).socketsLeave(`device:${deviceId}`);
}

export function emitToDevice(deviceId, event, payload) {
  if (!io) return;

  io.to(`device:${deviceId}`).emit(event, payload);
}
