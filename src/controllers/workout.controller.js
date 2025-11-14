// controllers/workout.controller.js
import Workout from '../models/Workout.model.js';
import { validationResult } from 'express-validator';
import cloudinary from '../config/cloudinary.js';
import { uploadExerciseMediaToCloudinary, deleteFromCloudinary } from '../utils/cloudinary.utils.js';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';















export const getWorkouts = async (req, res) => {
  try {
    const { companyPublicId } = req.user;
    const { page = 1, limit = 10, search } = req.query;

    const filter = { companyPublicId, isActive: true };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'exercises.name': { $regex: search, $options: 'i' } }
      ];
    }

    const workouts = await Workout.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('publicId name description exercises totalDuration createdAt')
      .lean(); // Usar lean() para melhor performance

    // Processar os workouts para incluir informações das mídias
    const processedWorkouts = workouts.map(workout => ({
      publicId: workout.publicId,
      name: workout.name,
      description: workout.description,
      totalDuration: workout.totalDuration,
      exercisesCount: workout.exercises.length,
      // Incluir apenas a primeira mídia como thumbnail (se existir)
      thumbnail: workout.exercises.find(ex => ex.mediaFile?.url)?.mediaFile?.url || null,
      // Incluir informações resumidas dos exercícios
      exercises: workout.exercises.map(exercise => ({
        publicId: exercise.publicId,
        name: exercise.name,
        duration: exercise.duration,
        type: exercise.type,
        // Incluir apenas informações básicas da mídia
        mediaFile: exercise.mediaFile ? {
          url: exercise.mediaFile.url,
          type: exercise.mediaFile.type,
          // Incluir thumbnail para vídeos se necessário
          thumbnail: exercise.mediaFile.type === 'video' ? 
            exercise.mediaFile.url.replace('.mp4', '.jpg') : null // Cloudinary gera thumbnails automaticamente
        } : null
      })),
      createdAt: workout.createdAt
    }));

    const total = await Workout.countDocuments(filter);

    res.json({
      success: true,
      data: {
        workouts: processedWorkouts,
        totalPages: Math.ceil(total / limit),
        currentPage: +page,
        total
      }
    });

  } catch (error) {
    console.error('Erro ao buscar treinos:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor' 
    });
  }
};

export const getWorkoutById = async (req, res) => {
  try {
    const { companyPublicId } = req.user;
    const { publicId } = req.params;

    const workout = await Workout.findOne({ 
      publicId, 
      companyPublicId, 
      isActive: true 
    })
    .select('-__v')
    .lean();

    if (!workout) {
      return res.status(404).json({ 
        success: false,
        message: 'Treino não encontrado' 
      });
    }

    // Processar o workout para incluir todas as informações das mídias
    const processedWorkout = {
      publicId: workout.publicId,
      name: workout.name,
      description: workout.description,
      totalDuration: workout.totalDuration,
      exercisesCount: workout.exercises.length,
      createdAt: workout.createdAt,
      updatedAt: workout.updatedAt,
      exercises: workout.exercises.map(exercise => ({
        publicId: exercise.publicId,
        name: exercise.name,
        duration: exercise.duration,
        type: exercise.type,
        targetMuscles: exercise.targetMuscles || [],
        instructions: exercise.instructions || '',
        restTime: exercise.restTime || 30,
        sets: exercise.sets || 1,
        reps: exercise.reps || 0,
        weight: exercise.weight || 0,
        // Incluir todas as informações da mídia
        mediaFile: exercise.mediaFile ? {
          url: exercise.mediaFile.url,
          type: exercise.mediaFile.type,
          name: exercise.mediaFile.name,
          publicId: exercise.mediaFile.publicId,
          resourceType: exercise.mediaFile.resourceType,
          format: exercise.mediaFile.format,
          width: exercise.mediaFile.width,
          height: exercise.mediaFile.height,
          duration: exercise.mediaFile.duration,
          // Para vídeos, você pode gerar URLs de thumbnail do Cloudinary
          thumbnail: exercise.mediaFile.type === 'video' ? 
            exercise.mediaFile.url.replace('/upload/', '/upload/w_400,h_225,c_fill/') : null,
          // URL para download se necessário
          downloadUrl: exercise.mediaFile.url.replace('/upload/', '/upload/fl_attachment/')
        } : null
      }))
    };

    res.json({
      success: true,
      data: processedWorkout
    });

  } catch (error) {
    console.error('Erro ao buscar treino por ID:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor' 
    });
  }
};


export const createWorkout = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      message: 'Dados inválidos', 
      errors: errors.array() 
    });
  }

  try {
    const { companyPublicId, publicId: userPublicId } = req.user;
    const { name, description, exercises } = req.body;

    console.log('📝 Dados recebidos para criar treino:', {
      name,
      description,
      exercisesCount: exercises?.length,
      filesCount: req.files?.length || 0,
      companyPublicId,
      userPublicId
    });

    // Processar exercícios
    const processedExercises = await Promise.all(
      exercises.map(async (exercise, index) => {
        let mediaFile = null;

        // Procurar arquivo correspondente a este exercício
        if (req.files && req.files.length > 0) {
          const fileFieldName = `exercises[${index}][mediaFile]`;
          const file = req.files.find(f => f.fieldname === fileFieldName);
          
          if (file) {
            try {
              console.log(`📁 Processando arquivo para exercício ${index}:`, file.originalname);

              // Fazer upload para Cloudinary
              const uploadResult = await uploadExerciseMediaToCloudinary(
                file.buffer,
                file.originalname
              );

              const isVideo = uploadResult.resource_type === 'video';
              mediaFile = {
                url: uploadResult.secure_url,
                type: isVideo ? 'video' : 'image',
                name: file.originalname,
                publicId: uploadResult.public_id,
                resourceType: uploadResult.resource_type,
                format: uploadResult.format,
                width: uploadResult.width,
                height: uploadResult.height,
                ...(isVideo && { duration: uploadResult.duration })
              };

              console.log(`✅ Mídia do exercício ${index} uploadada:`, file.originalname);
            } catch (uploadError) {
              console.error(`❌ Erro no upload da mídia do exercício ${index}:`, uploadError);
            }
          }
        }

        return {
          publicId: uuidv4(),
          name: exercise.name?.trim() || `Exercício ${index + 1}`,
          duration: parseInt(exercise.duration) || 60,
          type: exercise.type || 'cardio',
          targetMuscles: Array.isArray(exercise.targetMuscles) ? exercise.targetMuscles : [],
          instructions: exercise.instructions?.trim() || '',
          restTime: parseInt(exercise.restTime) || 30,
          sets: parseInt(exercise.sets) || 1,
          reps: parseInt(exercise.reps) || 0,
          weight: parseFloat(exercise.weight) || 0,
          ...(mediaFile && { mediaFile })
        };
      })
    );

    // Criar workout
    const workout = new Workout({
      publicId: uuidv4(),
      name: name.trim(),
      description: (description || '').trim(),
      exercises: processedExercises,
      companyPublicId,
      createdByPublicId: userPublicId
    });

    console.log('💾 Salvando workout no banco...');
    await workout.save();

    console.log('✅ Treino criado com sucesso! ID:', workout.publicId);

    res.status(201).json({
      success: true,
      message: 'Treino criado com sucesso!',
      data: {
        publicId: workout.publicId,
        name: workout.name,
        description: workout.description,
        totalDuration: workout.totalDuration,
        exercisesCount: workout.exercises.length,
        createdAt: workout.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Erro detalhado ao criar treino:', error);
    
    if (error.name === 'ValidationError') {
      console.error('🔍 Erros de validação:', error.errors);
    }

    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor ao criar treino'
    });
  }
};

const processExercises = (exercises) => {
  return exercises.map((exercise, index) => ({
    name: exercise.name?.trim() || `Exercício ${index + 1}`,
    description: exercise.instructions?.trim() || exercise.description?.trim() || '',
    duration: Math.max(1, parseInt(exercise.duration) || 60),
    restTime: Math.max(0, parseInt(exercise.restTime) || 30),
    type: ['cardio', 'strength', 'warmup', 'cooldown', 'flexibility'].includes(exercise.type)
      ? exercise.type
      : 'cardio',
    sets: Math.max(1, parseInt(exercise.sets) || 1),
    reps: Math.max(0, parseInt(exercise.reps) || 0),
    weight: Math.max(0, parseFloat(exercise.weight) || 0),
    targetMuscles: Array.isArray(exercise.targetMuscles) ? exercise.targetMuscles : [],
    video: exercise.video || null,
    tips: Array.isArray(exercise.tips) ? exercise.tips : [],
    order: index,
    completed: false
  }));
};

export const updateWorkout = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Dados inválidos',
      errors: errors.array()
    });
  }

  try {
    const { publicId } = req.params;
    const { name, description, exercises } = req.body;
    const { companyPublicId } = req.user;

    const workout = await Workout.findOne({
      publicId,
      companyPublicId
    });

    if (!workout) {
      return res.status(404).json({
        success: false,
        message: 'Treino não encontrado'
      });
    }

    // Processar exercícios para update
    const processedExercises = await Promise.all(
      exercises.map(async (exercise, index) => {
        let mediaFile = null;

        // Verificar se há novo arquivo de mídia
        if (req.files && req.files[`exercises[${index}][mediaFile]`]) {
          const file = req.files[`exercises[${index}][mediaFile]`];

          try {
            // Validar arquivo (mesma validação do create)
            const maxSize = 10 * 1024 * 1024;
            if (file.size > maxSize) {
              throw new Error('Arquivo muito grande. Tamanho máximo: 10MB');
            }

            const allowedTypes = [
              'image/gif', 'image/jpeg', 'image/png', 'image/webp',
              'video/mp4', 'video/mov', 'video/avi', 'video/webm', 'video/quicktime'
            ];

            if (!allowedTypes.includes(file.mimetype)) {
              throw new Error('Tipo de arquivo não suportado');
            }

            // Deletar mídia antiga se existir
            const oldExercise = workout.exercises[index];
            if (oldExercise?.mediaFile?.publicId) {
              await deleteFromCloudinary(oldExercise.mediaFile.publicId);
            }

            // Fazer upload da nova mídia
            const uploadResult = await uploadExerciseMediaToCloudinary(
              file.data,
              file.name
            );

            const isVideo = uploadResult.resource_type === 'video';
            mediaFile = {
              url: uploadResult.secure_url,
              type: isVideo ? 'video' : 'image',
              name: file.name,
              publicId: uploadResult.public_id,
              resourceType: uploadResult.resource_type,
              format: uploadResult.format,
              width: uploadResult.width,
              height: uploadResult.height,
              ...(isVideo && { duration: uploadResult.duration })
            };

          } catch (uploadError) {
            console.error(`❌ Erro no upload da mídia do exercício ${index}:`, uploadError);
            // Manter a mídia existente em caso de erro
            mediaFile = workout.exercises[index]?.mediaFile || null;
          }
        } else {
          // Manter a mídia existente se não há novo upload
          mediaFile = workout.exercises[index]?.mediaFile || null;
        }

        return {
          publicId: exercise.publicId || uuidv4(),
          name: exercise.name?.trim() || `Exercício ${index + 1}`,
          duration: parseInt(exercise.duration) || 60,
          type: exercise.type || 'cardio',
          targetMuscles: Array.isArray(exercise.targetMuscles) ? exercise.targetMuscles : [],
          instructions: exercise.instructions?.trim() || '',
          restTime: parseInt(exercise.restTime) || 30,
          sets: parseInt(exercise.sets) || 1,
          reps: parseInt(exercise.reps) || 0,
          weight: parseFloat(exercise.weight) || 0,
          mediaFile
        };
      })
    );

    // Atualizar workout
    workout.name = name.trim();
    workout.description = (description || '').trim();
    workout.exercises = processedExercises;

    await workout.save();

    res.json({
      success: true,
      message: 'Treino atualizado com sucesso!',
      data: {
        publicId: workout.publicId,
        name: workout.name,
        description: workout.description,
        totalDuration: workout.totalDuration,
        exercisesCount: workout.exercises.length,
        updatedAt: workout.updatedAt
      }
    });

  } catch (error) {
    console.error('❌ Erro ao atualizar treino:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor ao atualizar treino'
    });
  }
};

export const deleteWorkout = async (req, res) => {
  try {
    const { publicId } = req.params;
    const { companyPublicId } = req.user;

    const workout = await Workout.findOne({
      publicId,
      companyPublicId
    });

    if (!workout) {
      return res.status(404).json({
        success: false,
        message: 'Treino não encontrado'
      });
    }

    // Deletar todas as mídias do Cloudinary
    const deletePromises = workout.exercises
      .filter(ex => ex.mediaFile?.publicId)
      .map(ex => deleteFromCloudinary(ex.mediaFile.publicId));

    await Promise.allSettled(deletePromises);

    // Deletar workout
    await Workout.deleteOne({ publicId });

    res.json({
      success: true,
      message: 'Treino deletado com sucesso'
    });

  } catch (error) {
    console.error('❌ Erro ao deletar treino:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor ao deletar treino'
    });
  }
};

export const getWorkoutStats = async (req, res) => {
  try {
    const { companyPublicId } = req.user;

    const stats = await Workout.aggregate([
      { $match: { companyPublicId, isActive: true } },
      {
        $group: {
          _id: null,
          totalWorkouts: { $sum: 1 },
          totalExercises: { $sum: { $size: '$exercises' } },
          totalDuration: { $sum: '$totalDuration' },
          avgExercises: { $avg: { $size: '$exercises' } }
        }
      }
    ]);

    res.json(stats[0] || { totalWorkouts: 0, totalExercises: 0, totalDuration: 0, avgExercises: 0 });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
};