import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service.js';
import * as passwordService from '../services/password.service.js';
import * as sessionService from '../services/session.service.js';
import * as otpService from '../services/otp.service.js';
import * as mfaService from '../services/mfa.service.js';

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

export async function mfaVerifyLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.completeMfaLogin(
      req.body.mfaToken,
      req.body.code,
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

export async function forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await passwordService.requestPasswordReset(req.body.email);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await passwordService.resetPassword(req.body.token, req.body.password);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await passwordService.changePassword(
      req.user!.id,
      req.body.currentPassword,
      req.body.newPassword,
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function listSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sessions = await sessionService.listSessions(req.user!.id);
    res.json({ success: true, data: sessions });
  } catch (error) {
    next(error);
  }
}

export async function revokeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const result = await sessionService.revokeSession(req.user!.id, id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function revokeAllSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await sessionService.revokeAllSessions(req.user!.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function sendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await otpService.sendOtp(req.user!.id, req.body.purpose);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await otpService.verifyOtp(req.user!.id, req.body.purpose, req.body.code);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function enableMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await mfaService.enableMfa(req.user!.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function disableMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await mfaService.disableMfa(req.user!.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
