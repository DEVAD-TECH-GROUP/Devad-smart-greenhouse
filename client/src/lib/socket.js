import { io } from 'socket.io-client';
import { getAccessToken, refreshSession } from './api.js';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io({
      auth: (cb) => cb({ token: getAccessToken() }),
    });
    socket.on('connect_error', async (err) => {
      if (err.message === 'unauthorized') {
        try {
          await refreshSession();
          socket.connect();
        } catch { /* signed out: stay disconnected */ }
      }
    });
  }
  return socket;
}

export function closeSocket() {
  if (socket) socket.close();
  socket = null;
}
