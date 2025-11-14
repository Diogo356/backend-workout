// CORREÇÃO NO workouts.route.js
import express from 'express';
import multer from 'multer';
import { 
  getWorkouts, 
  getWorkoutById, 
  createWorkout, 
  updateWorkout, 
  deleteWorkout, 
  getWorkoutStats
} from '../controllers/workout.controller.js';
import { verifyAccessToken } from '../controllers/auth.controller.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Configuração do Multer
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 10 // Máximo 10 arquivos
  }
});

// Middleware para validação
const workoutValidation = [
  body('name').notEmpty().withMessage('Nome é obrigatório'),
  body('exercises').isArray({ min: 1 }).withMessage('Pelo menos 1 exercício')
];

// Middleware para processar FormData com arrays
const processFormData = (req, res, next) => {
  // Se há campos de exercícios, processar arrays
  if (req.body && typeof req.body === 'object') {
    for (const key in req.body) {
      if (key.startsWith('exercises[') && key.includes('][targetMuscles]')) {
        try {
          const match = key.match(/exercises\[(\d+)\]\[targetMuscles\]/);
          if (match) {
            const index = match[1];
            req.body.exercises = req.body.exercises || [];
            req.body.exercises[index] = req.body.exercises[index] || {};
            req.body.exercises[index].targetMuscles = JSON.parse(req.body[key]);
          }
        } catch (e) {
          console.warn('Erro ao parsear targetMuscles:', e);
        }
      }
      if (key.startsWith('exercises[') && key.includes('][tips]')) {
        try {
          const match = key.match(/exercises\[(\d+)\]\[tips\]/);
          if (match) {
            const index = match[1];
            req.body.exercises = req.body.exercises || [];
            req.body.exercises[index] = req.body.exercises[index] || {};
            req.body.exercises[index].tips = JSON.parse(req.body[key]);
          }
        } catch (e) {
          console.warn('Erro ao parsear tips:', e);
        }
      }
    }
  }
  next();
};

// Rotas com upload de arquivos
router.post(
  '/', 
  verifyAccessToken, 
  upload.any(),
  processFormData,
  workoutValidation,
  createWorkout
);

router.put(
  '/:publicId', 
  verifyAccessToken, 
  upload.any(),
  processFormData,
  workoutValidation,
  updateWorkout
);

// Rotas sem upload
router.get('/', verifyAccessToken, getWorkouts);
router.get('/stats', verifyAccessToken, getWorkoutStats);
router.get('/:publicId', verifyAccessToken, getWorkoutById);
router.delete('/:publicId', verifyAccessToken, deleteWorkout);

export default router;