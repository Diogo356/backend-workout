// routes/authRoutes.js
import express from 'express';
import { 
  registerCompany, 
  loginCompany,
  refreshToken,
  logout,
  getCurrentUser,
  getActiveSessions,
  verifyAccessToken,
  verifyRefreshToken
} from '../controllers/auth.controller.js';

const router = express.Router();

// Rotas Públicas
router.post('/register', registerCompany);
router.post('/login', loginCompany);
router.post('/refresh-token', verifyRefreshToken, refreshToken);

router.post('/logout', verifyAccessToken, logout);
router.get('/me', verifyAccessToken, getCurrentUser);
router.get('/sessions', verifyAccessToken, getActiveSessions);

export default router;