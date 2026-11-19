import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { env, isProduction } from './config/env.js';
import { globalRateLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: isProduction,
    crossOriginEmbedderPolicy: isProduction,
  }),
  );

  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false, limit: '2mb' }));
  app.use(cookieParser());
  app.use(globalRateLimiter);

  app.use('/api/v1', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}


// git test..