// models/User.model.js - VERSÃO CORRIGIDA E COMPLETA
import mongoose from 'mongoose';
import crypto from 'crypto';

const userSchema = new mongoose.Schema({
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
  
  name: {
    type: String,
    required: [true, 'Nome é obrigatório'],
    trim: true
  },
  
  email: {
    type: String,
    required: [true, 'Email é obrigatório'],
    lowercase: true
  },
  
  password: {
    type: String,
    required: [true, 'Senha é obrigatória']
  },

  // REFRESH TOKENS - SEMPRE ARRAY
  refreshTokens: {
    type: [{
      token: {
        type: String,
        required: true
      },
      deviceInfo: {
        userAgent: String,
        ip: String,
        lastUsed: Date
      },
      expiresAt: {
        type: Date,
        required: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    default: [] // CRÍTICO: sempre array vazio por padrão
  },

  role: {
    type: String,
    enum: ['admin', 'super_admin', 'viewer'], // Simplificamos os roles
    default: 'viewer'
  },

  permissions: {
    canViewWorkouts: { type: Boolean, default: true }, // Viewer pode ver treinos
    canViewAnalytics: { type: Boolean, default: false }, // Só admin vê analytics
    canManageContent: { type: Boolean, default: false } // Só admin gerencia
  },

  // SEGURANÇA - MANTEMOS PARA TODOS
  isLocked: { type: Boolean, default: false },
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },
  lastLogin: { type: Date },

  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  }

}, {
  timestamps: true
});

// ===================== MÉTODOS =====================

// Adicionar refresh token
userSchema.methods.addRefreshToken = async function(token, deviceInfo = {}) {
  // GARANTE QUE É ARRAY
  if (!Array.isArray(this.refreshTokens)) {
    this.refreshTokens = [];
  }

  this.refreshTokens.push({
    token,
    deviceInfo: {
      userAgent: deviceInfo.userAgent || 'unknown',
      ip: deviceInfo.ip || 'unknown',
      lastUsed: new Date()
    },
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
    createdAt: new Date()
  });

  // Limita a 5 sessões
  if (this.refreshTokens.length > 5) {
    this.refreshTokens = this.refreshTokens.slice(-5);
  }

  return this.save();
};

// Limpar tokens expirados
userSchema.methods.cleanExpiredTokens = async function() {
  if (!Array.isArray(this.refreshTokens)) {
    this.refreshTokens = [];
    return this;
  }

  const now = new Date();
  this.refreshTokens = this.refreshTokens.filter(token => 
    token.expiresAt > now
  );

  return this.save();
};

// Incrementar tentativas de login
userSchema.methods.incrementLoginAttempts = async function() {
  // Se lockUntil não existe ou já expirou, reinicia
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.resetLoginAttempts();
  }
  
  this.loginAttempts += 1;
  
  // Bloqueia após 5 tentativas por 30 minutos
  if (this.loginAttempts >= 5 && !this.isLocked) {
    this.isLocked = true;
    this.lockUntil = Date.now() + 30 * 60 * 1000; // 30 minutos
  }
  
  return this.save();
};

// Resetar tentativas de login
userSchema.methods.resetLoginAttempts = async function() {
  this.loginAttempts = 0;
  this.lockUntil = null;
  this.isLocked = false;
  return this.save();
};

// Verificar se está bloqueado
userSchema.methods.isLoginBlocked = function() {
  return !!(this.isLocked && this.lockUntil && this.lockUntil > Date.now());
};

export default mongoose.model('User', userSchema);