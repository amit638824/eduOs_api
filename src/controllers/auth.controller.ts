import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service.js';

function getDeviceInfo(req: Request): Record<string, unknown> {
  return {
    userAgent: req.headers['user-agent'] ?? 'unknown',
    platform: req.headers['sec-ch-ua-platform'] ?? 'unknown',
  };
}

function getClientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim();
  }
  return req.socket.remoteAddress;
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.registerUser(req.body, getDeviceInfo(req), getClientIp(req));
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.loginUser(
      req.body.email,
      req.body.password,
      getDeviceInfo(req),
      getClientIp(req),
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.refreshAccessToken(
      req.body.refreshToken,
      getDeviceInfo(req),
      getClientIp(req),
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await authService.logoutUser(req.body.refreshToken);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const profile = await authService.getUserProfile(req.user!.id);
    res.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
}
