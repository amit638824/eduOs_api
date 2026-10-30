import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { corsOrigins } from '../config/env.js';
import { query } from '../config/database.js';
import { verifyAccessToken } from '../utils/security.js';

let io: Server | null = null;

function userRoom(userId: string) {
  return `user:${userId}`;
}

export function initRealtime(server: HttpServer) {
  io = new Server(server, {
    path: '/socket.io',
    cors: {
      origin: corsOrigins,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const header = socket.handshake.headers.authorization;
      const fromHeader =
        typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
      const fromAuth =
        typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : '';
      const token = fromAuth || fromHeader;
      if (!token) {
        next(new Error('Unauthorized'));
        return;
      }

      const payload = verifyAccessToken(token);
      const user = await query<{ id: string; status: string }>(
        `SELECT id, status FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [payload.sub],
      );
      if (!user.rows[0] || user.rows[0].status !== 'active') {
        next(new Error('Unauthorized'));
        return;
      }

      socket.data.userId = user.rows[0].id;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string | undefined;
    if (userId) socket.join(userRoom(userId));
  });

  return io;
}

export function emitNotification(userId: string, notification: unknown, unreadCount: number) {
  io?.to(userRoom(userId)).emit('notification', { notification, unreadCount });
}

export function emitUnreadCount(userId: string, unreadCount: number) {
  io?.to(userRoom(userId)).emit('notification:count', { unreadCount });
}
