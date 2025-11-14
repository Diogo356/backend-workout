// controllers/usersController.js
import User from '../models/User.model.js';
import Company from '../models/Company.model.js';
import bcrypt from 'bcryptjs';

export const createUser = async (req, res) => {
  try {
    const { name, email, password, role = 'viewer', permissions = {} } = req.body;
    const companyPublicId = req.companyPublicId; // Do middleware de auth

    // Validar dados obrigatórios
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Nome, email e senha são obrigatórios'
      });
    }

    // Verificar se empresa existe
    const company = await Company.findOne({ publicId: companyPublicId });
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Empresa não encontrada'
      });
    }

    // Verificar se email já existe na empresa
    const existingUser = await User.findOne({ 
      email: email.toLowerCase(),
      companyPublicId 
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Já existe um usuário com este email na empresa'
      });
    }

    // Verificar limite de usuários da empresa
    const userCount = await User.countDocuments({ companyPublicId });
    if (userCount >= company.settings.maxUsers) {
      return res.status(403).json({
        success: false,
        message: `Limite de ${company.settings.maxUsers} usuários atingido`
      });
    }

    // Hash da senha
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Definir permissões padrão baseadas no role
    const defaultPermissions = {
      canViewWorkouts: true, // Todos podem ver treinos
      canViewAnalytics: role === 'admin' || role === 'super_admin',
      canManageContent: role === 'admin' || role === 'super_admin'
    };

    // Criar usuário
    const user = new User({
      companyPublicId,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role,
      permissions: { ...defaultPermissions, ...permissions }
    });

    await user.save();

    // Remover senha do response
    const userResponse = {
      publicId: user.publicId,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      status: user.status,
      createdAt: user.createdAt
    };

    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso',
      user: userResponse
    });

  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getUsers = async (req, res) => {
  try {
    const companyPublicId = req.companyPublicId;
    const { page = 1, limit = 10, search = '', role = '' } = req.query;

    // Construir query de busca
    const query = { companyPublicId };
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) {
      query.role = role;
    }

    // Paginação
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const users = await User.find(query)
      .select('-password -refreshTokens')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      users,
      pagination: {
        current: pageNumber,
        pages: Math.ceil(total / limitNumber),
        total
      }
    });

  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};

export const getUser = async (req, res) => {
  try {
    const { publicId } = req.params;
    const companyPublicId = req.companyPublicId;
    const requestingUser = req.user;

    // Verificar se usuário existe na empresa
    const user = await User.findOne({ 
      publicId, 
      companyPublicId 
    }).select('-password -refreshTokens');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    // Verificar permissão (admin ou próprio usuário)
    if ((requestingUser.role !== 'admin' || requestingUser.role !== 'super_admin') && requestingUser.publicId !== publicId) {
      return res.status(403).json({
        success: false,
        message: 'Sem permissão para acessar este usuário'
      });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { publicId } = req.params;
    const companyPublicId = req.companyPublicId;
    const { name, email, role, permissions, status } = req.body;

    // Verificar se usuário existe
    const user = await User.findOne({ publicId, companyPublicId });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    // Verificar se email já existe (se foi alterado)
    if (email && email !== user.email) {
      const emailExists = await User.findOne({ 
        email: email.toLowerCase(),
        companyPublicId,
        publicId: { $ne: publicId } // Excluir o próprio usuário
      });

      if (emailExists) {
        return res.status(409).json({
          success: false,
          message: 'Já existe um usuário com este email'
        });
      }
      user.email = email.toLowerCase().trim();
    }

    // Atualizar campos
    if (name) user.name = name.trim();
    if (role) user.role = role;
    if (permissions) user.permissions = { ...user.permissions, ...permissions };
    if (status) user.status = status;

    await user.save();

    // Remover campos sensíveis
    const userResponse = {
      publicId: user.publicId,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      status: user.status,
      updatedAt: user.updatedAt
    };

    res.json({
      success: true,
      message: 'Usuário atualizado com sucesso',
      user: userResponse
    });

  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { publicId } = req.params;
    const companyPublicId = req.companyPublicId;
    const requestingUser = req.user;

    // Impedir que admin se delete
    if (requestingUser.publicId === publicId) {
      return res.status(400).json({
        success: false,
        message: 'Não é possível excluir sua própria conta'
      });
    }

    const user = await User.findOne({ publicId, companyPublicId });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    await User.deleteOne({ publicId, companyPublicId });

    res.json({
      success: true,
      message: 'Usuário excluído com sucesso'
    });

  } catch (error) {
    console.error('Erro ao excluir usuário:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};

export const updatePassword = async (req, res) => {
  try {
    const { publicId } = req.params;
    const companyPublicId = req.companyPublicId;
    const { currentPassword, newPassword } = req.body;
    const requestingUser = req.user;

    // Verificar permissão
    if ((requestingUser.role !== 'admin' || requestingUser.role !== 'super_admin') && requestingUser.publicId !== publicId) {
      return res.status(403).json({
        success: false,
        message: 'Sem permissão para alterar esta senha'
      });
    }

    const user = await User.findOne({ publicId, companyPublicId });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    // Se não for admin, verificar senha atual
    if ((requestingUser.role !== 'admin' || requestingUser.role !== 'super_admin')) {
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Senha atual incorreta'
        });
      }
    }

    // Validar nova senha
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Nova senha deve ter pelo menos 6 caracteres'
      });
    }

    // Atualizar senha
    const saltRounds = 12;
    user.password = await bcrypt.hash(newPassword, saltRounds);
    
    // Limpar todas as sessões (forçar logout de todos os dispositivos)
    user.refreshTokens = [];
    
    await user.save();

    res.json({
      success: true,
      message: 'Senha atualizada com sucesso'
    });

  } catch (error) {
    console.error('Erro ao atualizar senha:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};

export const toggleUserStatus = async (req, res) => {
  try {
    const { publicId } = req.params;
    const companyPublicId = req.companyPublicId;
    const requestingUser = req.user;

    // Impedir que admin desative a si mesmo
    if (requestingUser.publicId === publicId) {
      return res.status(400).json({
        success: false,
        message: 'Não é possível desativar sua própria conta'
      });
    }

    const user = await User.findOne({ publicId, companyPublicId });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    // Alternar status
    user.status = user.status === 'active' ? 'inactive' : 'active';
    
    // Se estiver desativando, limpar sessões
    if (user.status === 'inactive') {
      user.refreshTokens = [];
    }

    await user.save();

    res.json({
      success: true,
      message: `Usuário ${user.status === 'active' ? 'ativado' : 'desativado'} com sucesso`,
      status: user.status
    });

  } catch (error) {
    console.error('Erro ao alternar status:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};