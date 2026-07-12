import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';
import { authenticate } from '../middleware/auth.js';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  otpRequestSchema,
  otpVerifySchema,
  mfaVerifyLoginSchema,
} from '../validators/schemas.js';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', authRateLimiter, validate(registerSchema), authController.register);
router.post('/login', authRateLimiter, validate(loginSchema), authController.login);
router.post('/mfa/verify-login', authRateLimiter, validate(mfaVerifyLoginSchema), authController.mfaVerifyLogin);
router.post('/refresh', authRateLimiter, validate(refreshTokenSchema), authController.refresh);
router.post('/logout', validate(refreshTokenSchema), authController.logout);
router.get('/me', authenticate, authController.me);

router.post('/forgot-password', authRateLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', authRateLimiter, validate(resetPasswordSchema), authController.resetPassword);
router.post('/change-password', authenticate, validate(changePasswordSchema), authController.changePassword);

router.get('/sessions', authenticate, authController.listSessions);
router.delete('/sessions/:id', authenticate, authController.revokeSession);
router.post('/sessions/revoke-all', authenticate, authController.revokeAllSessions);

router.post('/otp/send', authenticate, validate(otpRequestSchema), authController.sendOtp);
router.post('/otp/verify', authenticate, validate(otpVerifySchema), authController.verifyOtp);

router.post('/mfa/enable', authenticate, authController.enableMfa);
router.post('/mfa/disable', authenticate, authController.disableMfa);

export default router;
