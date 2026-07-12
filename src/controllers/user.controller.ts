import { Request, Response, NextFunction } from 'express';
import * as userService from '../services/user.service.js';
import { getUserProfile } from '../services/auth.service.js';

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const updated = await userService.updateProfile(req.user!.id, req.body);
    const profile = await getUserProfile(req.user!.id);
    res.json({ success: true, data: profile ?? updated });
  } catch (e) {
    next(e);
  }
}
