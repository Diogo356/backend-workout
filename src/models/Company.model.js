// models/Company.model.js - VERSÃO ATUALIZADA
import mongoose from 'mongoose';
import crypto from 'crypto';

const companySchema = new mongoose.Schema({
  publicId: {
    type: String,
    unique: true,
    required: true,
    default: () => crypto.randomBytes(16).toString('hex')
  },
  
  name: {
    type: String,
    required: [true, 'Nome da empresa é obrigatório'],
    trim: true
  },
  
  email: {
    type: String,
    required: [true, 'Email é obrigatório'],
    unique: true,
    lowercase: true
  },
  
  password: {
    type: String,
    required: [true, 'Senha é obrigatória']
  },

  // NOVAS CONFIGURAÇÕES ADICIONADAS
  slogan: {
    type: String,
    default: 'Treine com propósito'
  },

  logo: {
    url: String,
    publicId: String
  },

  theme: {
    primaryColor: { type: String, default: '#3B82F6' },
    secondaryColor: { type: String, default: '#1E40AF' }
  },

  contact: {
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' }
  },

  social: {
    instagram: { type: String, default: '' },
    facebook: { type: String, default: '' },
    whatsapp: { type: String, default: '' }
  },

  settings: {
    maxUsers: { type: Number, default: 5 },
    language: { type: String, default: 'pt-BR' },
    timezone: { type: String, default: 'America/Sao_Paulo' }
  },

  // Plano e Faturamento
  plan: {
    type: String,
    enum: ['free', 'pro', 'enterprise'],
    default: 'free'
  },

  billing: {
    status: { type: String, enum: ['active', 'pending', 'canceled'], default: 'active' },
    nextBillingDate: Date,
    stripeCustomerId: String
  },

  status: {
    type: String,
    enum: ['active', 'suspended', 'canceled'],
    default: 'active'
  }

}, {
  timestamps: true
});

// Índices para performance
companySchema.index({ publicId: 1 });
companySchema.index({ email: 1 });
companySchema.index({ status: 1 });

const Company = mongoose.model('Company', companySchema);
export default Company;