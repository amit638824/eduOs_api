import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { ValidationError } from '../utils/errors.js';

type RequestTarget = 'body' | 'query' | 'params';

/** Express 5: req.query / req.params are read-only — read validated values via these helpers */
export function vQuery<T>(req: Request): T {
  return (req.validated?.query ?? req.query) as T;
}

export function vParams<T>(req: Request): T {
  return (req.validated?.params ?? req.params) as T;
}

export function vBody<T>(req: Request): T {
  return (req.validated?.body ?? req.body) as T;
}

export function validate(schema: ZodSchema, target: RequestTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      next(new ValidationError('Validation failed', result.error.flatten()));
      return;
    }

    if (!req.validated) req.validated = {};

    if (target === 'body') {
      req.body = result.data;
      req.validated.body = result.data;
    } else {
      // query & params are getter-only in Express 5 — store on req.validated
      req.validated[target] = result.data;
    }

    next();
  };
}
