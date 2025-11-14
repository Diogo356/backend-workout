import express from 'express';
import { 
  getCompanySettings,
  updateCompanySettings,
  getPlanInfo,
  updatePlan
} from '../controllers/companySettings.controller.js';
import { verifyAccessToken } from '../controllers/auth.controller.js';

const router = express.Router();

// Todas as rotas exigem autenticação
router.use(verifyAccessToken);

// Configurações da empresa
router.get('/settings', getCompanySettings);
router.put('/settings', updateCompanySettings);

// Informações do plano
router.get('/plan', getPlanInfo);
router.put('/plan', updatePlan);

export default router;