import { Request, Response } from 'express';
import { checkDatabaseConnection } from '../config/database.js';

export async function healthCheck(_req: Request, res: Response): Promise<void> {
  const dbHealthy = await checkDatabaseConnection();
  const status = dbHealthy ? 'healthy' : 'degraded';
  res.status(dbHealthy ? 200 : 503).json({
    success: dbHealthy,
    status,
    timestamp: new Date().toISOString(),
    services: { database: dbHealthy ? 'up' : 'down' },
  });
}
