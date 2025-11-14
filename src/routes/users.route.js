// routes/userRoutes.js
import express from 'express';
import { 
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  updatePassword,
  toggleUserStatus
} from '../controllers/user.controller.js';
import { verifyAccessToken } from '../controllers/auth.controller.js';

const router = express.Router();

// ===================== MIDDLEWARE DE ADMIN =====================
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin' || req.user.role === 'super_admin') {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: 'Acesso restrito a administradores'
    });
  }
};

// Todas as rotas requerem autenticação
router.use(verifyAccessToken);

// GET /api/users - Listar usuários (apenas admin)
router.get('/', requireAdmin, getUsers);

// GET /api/users/:publicId - Buscar usuário específico (admin ou próprio usuário)
router.get('/:publicId', getUser);

// POST /api/users - Criar novo usuário (apenas admin)
router.post('/', requireAdmin, createUser);

// PUT /api/users/:publicId - Atualizar usuário (apenas admin)
router.put('/:publicId', requireAdmin, updateUser);

// DELETE /api/users/:publicId - Deletar usuário (apenas admin)
router.delete('/:publicId', requireAdmin, deleteUser);

// PUT /api/users/:publicId/password - Atualizar senha (admin ou próprio usuário)
router.put('/:publicId/password', updatePassword);

// PATCH /api/users/:publicId/toggle-status - Alternar status (apenas admin)
router.patch('/:publicId/toggle-status', requireAdmin, toggleUserStatus);

export default router;