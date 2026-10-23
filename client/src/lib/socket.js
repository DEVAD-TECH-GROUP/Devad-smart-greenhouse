
import { io } from 'socket.io-client';
import { getAccessToken, refreshSession } from './api.js';

const SOCKET_URL = 'https://devad-smart-greenhouse.onrender.com';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      withCredentials: true,
      auth: (callback) => callback({ token: getAccessToken() }),
      reconnection: true,
    });

    socket.on('connect_error', async (error) => {
      if (error.message === 'unauthorized') {
        try {
          await refreshSession();
          socket.connect();
        } catch {
          // The user needs to sign in again.
        }
      }
    });
  }

  return socket;
}

export function closeSocket() {
  if (socket) {
    socket.close();
    socket = null;
  }
}
