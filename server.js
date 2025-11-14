// CORREÇÃO NO app.js - VERSÃO CORRIGIDA
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cookieParser from 'cookie-parser';
dotenv.config();

import authRoutes from './src/routes/auth.route.js'
import workoutRoutes from './src/routes/workouts.route.js';
import companySettinsgsRoutes from './src/routes/companySettings.route.js';
import userRoutes from './src/routes/users.route.js';

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const app = express();

// ⚠️ OBRIGATÓRIO para cookies secure no Render
app.set("trust proxy", 1);

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 5000;

// =====================
// ✅ CORS CORRETO - USE APENAS ESTE
// =====================
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));

// 🚨 REMOVA ou COMENTE as headers manuais de CORS!
// app.use((req, res, next) => {
//   res.header("Access-Control-Allow-Origin", FRONTEND_URL);
//   res.header("Access-Control-Allow-Credentials", "true");
//   res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
//   res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
//   next();
// });

// =====================
// Base middlewares
// =====================
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =====================
// MongoDB connection
// =====================
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Conectado ao MongoDB'))
.catch(err => console.log('❌ Erro MongoDB:', err));

// =====================
// Routes
// =====================
app.use('/api/auth', authRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/company/settings', companySettinsgsRoutes);
app.use('/api/users', userRoutes);

// ✅ Adicione esta rota de debug para testar cookies
app.get('/api/debug/cookies', (req, res) => {
  console.log('🍪 Cookies recebidos:', req.cookies);
  console.log('🌐 Origin:', req.headers.origin);
  
  // Tentar setar cookie de teste
  res.cookie('debug_cookie', 'test_value_' + Date.now(), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000,
    path: '/'
  });
  
  res.json({
    success: true,
    message: 'Debug endpoint',
    cookiesReceived: req.cookies,
    yourOrigin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'Bem-vindo à API Academia' });
});

// =====================
// Server Start
// =====================
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌐 Frontend URL: ${FRONTEND_URL}`);
});