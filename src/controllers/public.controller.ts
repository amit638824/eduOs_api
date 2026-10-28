import { Request, Response } from 'express';
import { homepageContent } from '../data/homepage.js';

export function getHomepage(_req: Request, res: Response): void {
  res.json({ success: true, data: homepageContent });
}
