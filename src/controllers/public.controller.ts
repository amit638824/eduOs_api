import { Request, Response, NextFunction } from 'express';
import { homepageContent } from '../data/homepage.js';
import { sendContactFormEmail } from '../services/email.service.js';

export function getHomepage(_req: Request, res: Response): void {
  res.json({ success: true, data: homepageContent });
}

export async function submitContactForm(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, email, phone, subject, message } = req.body;
    if (!name || !email || !message) {
      res.status(400).json({ success: false, message: 'Name, email, and message are required.' });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(email).trim())) {
      res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
      return;
    }

    const sent = await sendContactFormEmail({
      name: String(name).trim(),
      email: String(email).trim(),
      phone: phone ? String(phone).trim() : '',
      subject: subject ? String(subject).trim() : 'General Enquiry',
      message: String(message).trim(),
    });

    if (!sent) {
      res.status(500).json({ success: false, message: 'Failed to send message. Please try again later.' });
      return;
    }

    res.json({ success: true, message: 'Your message has been sent successfully!' });
  } catch (error) {
    next(error);
  }
}
