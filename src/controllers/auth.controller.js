// src/controllers/auth.controller.js
import Company from '../models/Company.model.js';
import User from '../models/User.model.js';
import bcrypt from "bcryptjs";
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// === CONFIGURAÇÃO DE COOKIES ===
const cookieOptions = (maxAge) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
  maxAge
});

// === GERAR TOKENS ===
const generateTokens = (user, company) => {
  if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_SECRET e JWT_REFRESH_SECRET são obrigatórios no .env');
  }

  const accessToken = jwt.sign(
    {
      userPublicId: user.publicId,
      companyPublicId: company.publicId,
      role: user.role,
      type: 'access'
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  const refreshToken = crypto.randomBytes(40).toString('hex');
  const refreshTokenJWT = jwt.sign(
    {
      userPublicId: user.publicId,
      tokenId: refreshToken,
      type: 'refresh'
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken, refreshTokenJWT };
};

// === SET COOKIES ===
const setAuthCookies = (res, accessToken, refreshTokenJWT) => {
  res.cookie('access_token', accessToken, cookieOptions(15 * 60 * 1000)); // 15 min
  res.cookie('refresh_token', refreshTokenJWT, cookieOptions(7 * 24 * 60 * 60 * 1000)); // 7 dias
};

// === CLEAR COOKIES ===
const clearAuthCookies = (res) => {
  res.clearCookie('access_token', cookieOptions(0));
  res.clearCookie('refresh_token', cookieOptions(0));
};

// === REGISTER ===
export const registerCompany = async (req, res) => {
  try {
    const { companyName, email, password } = req.body;

    if (await Company.findOne({ email })) {
      return res.status(400).json({ success: false, message: 'Email já cadastrado' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const company = await Company.create({
      name: companyName,
      email,
      password: hashedPassword
    });

    const adminUser = await User.create({
      companyPublicId: company.publicId,
      name: 'Administrador',
      email,
      password: hashedPassword,
      role: 'super_admin',
      permissions: {
        canManageUsers: true,
        canManageWorkouts: true,
        canManageCompany: true,
        canViewAnalytics: true,
        canManageBilling: true
      }
    });

    const { accessToken, refreshToken, refreshTokenJWT } = generateTokens(adminUser, company);
    const deviceInfo = { userAgent: req.get('User-Agent'), ip: req.ip };
    await adminUser.addRefreshToken(refreshToken, deviceInfo);

    setAuthCookies(res, accessToken, refreshTokenJWT);

    res.status(201).json({
      success: true,
      message: 'Cadastro realizado com sucesso',
      data: {
        company: { publicId: company?.publicId, name: company?.name, email: company?.email, plan: company?.plan },
        user: { publicId: adminUser?.publicId, name: adminUser?.name, email: adminUser?.email, role: adminUser?.role }
      }
    });

  } catch (error) {
    console.error('Erro no cadastro:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
};

// controllers/auth.controller.js - CORREÇÃO NO LOGIN
export const loginCompany = async (req, res) => {
  try {
    const { email, password } = req.body;
    const deviceInfo = { userAgent: req.get('User-Agent'), ip: req.ip };

    console.log('🔐 Tentativa de login:', email);

    // Buscar usuário pelo email (não mais pela company)
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log('❌ Usuário não encontrado:', email);
      return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
    }

    // Verificar senha
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.log('❌ Senha inválida para:', email);
      
      // Incrementar tentativas de login
      await user.incrementLoginAttempts();
      
      return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
    }

    // Verificar se conta está bloqueada
    if (user.isLocked) {
      console.log('❌ Conta bloqueada:', email);
      return res.status(423).json({ success: false, message: 'Conta bloqueada' });
    }

    // Buscar empresa do usuário
    const company = await Company.findOne({ publicId: user.companyPublicId });
    if (!company) {
      console.log('❌ Empresa não encontrada para usuário:', email);
      return res.status(401).json({ success: false, message: 'Empresa não encontrada' });
    }

    console.log('✅ Credenciais válidas para:', email, 'Role:', user.role);

    // Gerar tokens
    const { accessToken, refreshToken, refreshTokenJWT } = generateTokens(user, company);
    
    // Adicionar refresh token
    await user.addRefreshToken(refreshToken, deviceInfo);

    // Atualizar último login e resetar tentativas
    user.lastLogin = new Date();
    await user.resetLoginAttempts();
    await user.save();

    // Setar cookies
    setAuthCookies(res, accessToken, refreshTokenJWT);

    // Response
    res.json({
      success: true,
      message: 'Login realizado com sucesso',
      data: {
        company: { 
          publicId: company.publicId, 
          name: company.name, 
          email: company.email, 
          plan: company.plan, 
          settings: company.settings 
        },
        user: { 
          publicId: user.publicId, 
          name: user.name, 
          email: user.email, 
          role: user.role, 
          permissions: user.permissions 
        }
      }
    });

  } catch (error) {
    console.error('❌ Erro no login:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
};

// === REFRESH TOKEN (COM ROTAÇÃO) ===
export const refreshToken = async (req, res) => {
  try {
    const refreshTokenJWT = req.cookies.refresh_token;
    if (!refreshTokenJWT) {
      return res.status(401).json({ success: false, message: 'Refresh token ausente' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshTokenJWT, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      clearAuthCookies(res);
      return res.status(401).json({ success: false, message: 'Refresh token inválido ou expirado' });
    }

    const { userPublicId, tokenId } = decoded;
    const user = await User.findOne({ publicId: userPublicId });
    if (!user) {
      clearAuthCookies(res);
      return res.status(401).json({ success: false, message: 'Usuário não encontrado' });
    }

    const company = await Company.findOne({ publicId: user.companyPublicId });
    if (!company) return res.status(401).json({ success: false, message: 'Empresa não encontrada' });

    await user.cleanExpiredTokens();
    const validToken = user.refreshTokens.find(t => t.token === tokenId);
    if (!validToken) {
      clearAuthCookies(res);
      return res.status(401).json({ success: false, message: 'Token revogado' });
    }

    // === ROTAÇÃO ===
    const { refreshToken: newTokenId, refreshTokenJWT: newRefreshJWT } = generateTokens(user, company);
    user.refreshTokens = user.refreshTokens.filter(t => t.token !== tokenId);
    await user.addRefreshToken(newTokenId, validToken.deviceInfo);
    const newEntry = user.refreshTokens.find(t => t.token === newTokenId);
    if (newEntry) newEntry.deviceInfo.lastUsed = new Date();
    await user.save();

    const accessToken = jwt.sign(
      { userPublicId: user.publicId, companyPublicId: company.publicId, role: user.role, type: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    setAuthCookies(res, accessToken, newRefreshJWT);

    res.json({
      success: true,
      message: 'Token renovado',
      data: {
        user: { publicId: user?.publicId, name: user?.name, email: user?.email, role: user?.role }
      }
    });

  } catch (error) {
    console.error('Erro no refresh:', error);
    clearAuthCookies(res);
    res.status(500).json({ success: false, message: 'Erro interno' });
  }
};

// === LOGOUT ===
export const logout = async (req, res) => {
  try {
    const userPublicId = req.user?.userPublicId;
    if (!userPublicId) return res.status(401).json({ success: false, message: 'Não autenticado' });

    const user = await User.findOne({ publicId: userPublicId });
    if (user) {
      const refreshTokenJWT = req.cookies.refresh_token;
      if (refreshTokenJWT) {
        try {
          const decoded = jwt.verify(refreshTokenJWT, process.env.JWT_REFRESH_SECRET);
          user.refreshTokens = user.refreshTokens.filter(t => t.token !== decoded.tokenId);
        } catch {}
      } else {
        user.refreshTokens = [];
      }
      await user.save();
    }

    clearAuthCookies(res);
    res.json({ success: true, message: 'Logout realizado' });

  } catch (error) {
    console.error('Erro no logout:', error);
    res.status(500).json({ success: false, message: 'Erro interno' });
  }
};

// === GET CURRENT USER ===
export const getCurrentUser = async (req, res) => {
  try {
    const userPublicId = req.user?.userPublicId;
    if (!userPublicId) return res.status(401).json({ success: false, message: 'Não autenticado' });

    const user = await User.findOne({ publicId: userPublicId });
    const company = await Company.findOne({ publicId: user.companyPublicId });

    if (!user || !company) return res.status(404).json({ success: false, message: 'Dados não encontrados' });

    res.json({
      success: true,
      data: {
        user: { publicId: user?.publicId, name: user?.name, email: user.email, role: user?.role, permissions: user?.permissions, lastLogin: user?.lastLogin },
        company: { publicId: company?.publicId, name: company?.name, email: company?.email, plan: company?.plan, settings: company?.settings }
      }
    });

  } catch (error) {
    console.error('Erro no /me:', error);
    res.status(500).json({ success: false, message: 'Erro interno' });
  }
};

// export const verifyAccessToken = async (req, res, next) => {
//   try {
//     // Verificar token no cookie primeiro
//     let token = req.cookies.access_token;
    
//     // Se não tiver no cookie, verificar no header Authorization
//     if (!token && req.headers.authorization) {
//       const authHeader = req.headers.authorization;
//       if (authHeader.startsWith('Bearer ')) {
//         token = authHeader.substring(7);
//       }
//     }

//     if (!token) {
//       return res.status(401).json({ 
//         success: false, 
//         message: 'Token de acesso não fornecido' 
//       });
//     }

//     // Verificar e decodificar o token
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
//     if (decoded.type !== 'access') {
//       return res.status(401).json({ 
//         success: false, 
//         message: 'Tipo de token inválido' 
//       });
//     }

//     // Buscar usuário no banco para verificar se ainda existe
//     const user = await User.findOne({ 
//       publicId: decoded.userPublicId,
//       isLocked: false 
//     }).select('publicId companyPublicId name email role');

//     if (!user) {
//       return res.status(401).json({ 
//         success: false, 
//         message: 'Usuário não encontrado ou bloqueado' 
//       });
//     }

//     // Adicionar usuário à requisição no formato CORRETO para o workout
//     req.user = {
//       publicId: user.publicId,           // Para workout.controller
//       userPublicId: user.publicId,       // Para compatibilidade com outros controllers
//       companyPublicId: user.companyPublicId,
//       name: user?.name,
//       email: user.email,
//       role: user.role
//     };

//     next();
//   } catch (error) {
//     console.error('❌ Erro na verificação do token:', error);
    
//     if (error.name === 'TokenExpiredError') {
//       return res.status(401).json({ 
//         success: false, 
//         message: 'Token expirado' 
//       });
//     }
    
//     if (error.name === 'JsonWebTokenError') {
//       return res.status(401).json({ 
//         success: false, 
//         message: 'Token inválido' 
//       });
//     }

//     return res.status(500).json({ 
//       success: false, 
//       message: 'Erro interno do servidor' 
//     });
//   }
// };

// === VERIFY REFRESH TOKEN ===
export const verifyRefreshToken = (req, res, next) => {
  const token = req.body.refreshToken || req.cookies.refresh_token;
  if (!token) return res.status(401).json({ success: false, message: 'Refresh token obrigatório' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    if (decoded.type !== 'refresh') throw new Error();
    req.refreshData = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Refresh token inválido' });
  }
};

// === GET ACTIVE SESSIONS ===
export const getActiveSessions = async (req, res) => {
  try {
    const userPublicId = req.user?.userPublicId;
    if (!userPublicId) return res.status(401).json({ success: false, message: 'Não autenticado' });

    const user = await User.findOne({ publicId: userPublicId });
    if (!user) return res.status(404).json({ success: false, message: 'Usuário não encontrado' });

    await user.cleanExpiredTokens();
    const sessions = user.refreshTokens.map(t => ({
      deviceInfo: t.deviceInfo,
      lastUsed: t.deviceInfo.lastUsed,
      createdAt: t.createdAt
    }));

    res.json({ success: true, data: { sessions } });
  } catch (error) {
    console.error('Erro nas sessões:', error);
    res.status(500).json({ success: false, message: 'Erro interno' });
  }
};

// === MIDDLEWARE DE DESENVOLVIMENTO (OPCIONAL) ===
export const verifyAccessTokenDev = async (req, res, next) => {
  // Para desenvolvimento - permite testar sem token
  if (process.env.NODE_ENV === 'development') {
    req.user = {
      publicId: 'dev-user-public-id',
      userPublicId: 'dev-user-public-id',
      companyPublicId: 'dev-company-public-id',
      name: 'Developer User',
      email: 'dev@example.com',
      role: 'super_admin'
    };

    return next();
  }
  
  // Para produção, usar o verifyAccessToken normal
  return verifyAccessToken(req, res, next);
};


// === VERIFY ACCESS TOKEN - CORRIGIDO ===
export const verifyAccessToken = async (req, res, next) => {
  try {
    // Verificar token no cookie primeiro
    let token = req.cookies.access_token;
    
    // Se não tiver no cookie, verificar no header Authorization
    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Token de acesso não fornecido' 
      });
    }

    // Verificar e decodificar o token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.type !== 'access') {
      return res.status(401).json({ 
        success: false, 
        message: 'Tipo de token inválido' 
      });
    }

    // Buscar usuário no banco para verificar se ainda existe
    const user = await User.findOne({ 
      publicId: decoded.userPublicId,
      isLocked: false 
    }).select('publicId companyPublicId name email role');

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuário não encontrado ou bloqueado' 
      });
    }

    // ✅ CORREÇÃO: ADICIONAR companyPublicId À REQUISIÇÃO
    req.companyPublicId = user.companyPublicId; // <--- ESTA LINHA ESTÁ FALTANDO!
    
    // Adicionar usuário à requisição no formato CORRETO para o workout
    req.user = {
      publicId: user.publicId,           // Para workout.controller
      userPublicId: user.publicId,       // Para compatibilidade com outros controllers
      companyPublicId: user.companyPublicId,
      name: user?.name,
      email: user.email,
      role: user.role
    };

    next();
  } catch (error) {
    console.error('❌ Erro na verificação do token:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expirado' 
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token inválido' 
      });
    }

    return res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor' 
    });
  }
};