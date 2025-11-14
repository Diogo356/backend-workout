// models/Workout.model.js
import mongoose from 'mongoose';
import crypto from 'crypto';

const exerciseSchema = new mongoose.Schema({
  publicId: {
    type: String,
    required: true,
    default: () => crypto.randomBytes(32).toString('hex')
  },
  
  name: {
    type: String,
    required: true,
    trim: true
  },
  
  duration: {
    type: Number, // em segundos
    required: true,
    min: 0
  },
  
  type: {
    type: String,
    enum: ['cardio', 'strength', 'warmup', 'cooldown', 'flexibility'],
    default: 'cardio'
  },
  
  targetMuscles: [{
    type: String,
    trim: true
  }],
  
  mediaFile: {
    url: String,
    type: {
      type: String,
      enum: ['image', 'video']
    },
    name: String
  },
  
  instructions: {
    type: String,
    trim: true
  },
  
  restTime: {
    type: Number,
    default: 0
  },
  
  sets: {
    type: Number,
    default: 1,
    min: 1
  },
  
  reps: {
    type: Number,
    default: 0,
    min: 0
  },
  
  weight: {
    type: Number,
    default: 0,
    min: 0
  }
});

const workoutSchema = new mongoose.Schema({
  publicId: {
    type: String,
    unique: true,
    required: true,
    default: () => crypto.randomBytes(16).toString('hex')
  },
  
  companyPublicId: {
    type: String,
    ref: 'Company',
    required: true
  },
  
  createdByPublicId: {
    type: String,
    ref: 'User',
    required: true
  },
  
  // Apenas nome e descrição
  name: {
    type: String,
    required: [true, 'Nome do treino é obrigatório'],
    trim: true
  },
  
  description: {
    type: String,
    trim: true
  },
  
  exercises: [exerciseSchema],

  isActive: {
    type: Boolean,
    default: true
  }

}, {
  timestamps: true
});

// Índices
workoutSchema.index({ publicId: 1 });
workoutSchema.index({ companyPublicId: 1, createdAt: -1 });
workoutSchema.index({ companyPublicId: 1, isActive: 1 });
workoutSchema.index({ createdByPublicId: 1 });

// CALCULAR totalDuration AUTOMATICAMENTE
workoutSchema.pre('save', function(next) {
  this.totalDuration = this.exercises.reduce((total, ex) => total + (ex.duration || 0), 0);
  next();
});

const Workout = mongoose.model('Workout', workoutSchema);
export default Workout;