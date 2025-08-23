import express from 'express';
import {
  loginController,
  refreshTokenController,
  registerController,
} from '../controllers/auth.controller';
import { validateSchema } from '../validations/validate-schema.validation';
import { LoginRequestDTO } from '../dto/login-request.dto';
import { RegisterRequestDTO } from '../dto/register-request.dto';

const router = express.Router();

// POST /login
router.post('/login', validateSchema(LoginRequestDTO), loginController);

// POST /register
router.post(
  '/register',
  validateSchema(RegisterRequestDTO),
  registerController,
);

// GET /refresh-token
router.get('/refresh-token', refreshTokenController);

export default router;
