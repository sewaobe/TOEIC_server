import express from 'express';
import {
  loginController,
  loginWithGoogleController,
  logoutController,
  refreshTokenController,
  registerController,
} from '../controllers/auth.controller';
import { validateSchema } from '../validations/validate-schema.validation';
import { LoginRequestDTO } from '../dto/login-request.dto';
import { RegisterRequestDTO } from '../dto/register-request.dto';
import {
  requestOtp,
  resetPassword,
  verifyOtp,
} from '../controllers/mail.controller';

const router = express.Router();

// POST /login
router.post('/login', validateSchema(LoginRequestDTO), loginController);
router.post('/google', loginWithGoogleController);

// POST /register
router.post(
  '/register',
  validateSchema(RegisterRequestDTO),
  registerController,
);

// GET /refresh-token
router.get('/refresh-token', refreshTokenController);
router.post('/logout', logoutController);

router.post('/request-otp', requestOtp);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);
export default router;
