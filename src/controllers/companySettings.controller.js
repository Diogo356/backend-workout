// controllers/companySettings.controller.js
import Company from '../models/Company.model.js';
import cloudinary from '../config/cloudinary.js';

const isValidColor = (color) => {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
};

// === FUNÇÃO PARA PARSEAR JSON STRINGS ===
const parseIfJson = (value) => {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

// Função para upload com conversão para WebP
const uploadToCloudinary = async (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'company-logos',
        format: 'webp',
        transformation: [
          { width: 400, height: 400, crop: 'limit' },
          { quality: 'auto' },
          { fetch_format: 'webp' }
        ],
        resource_type: 'image'
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(fileBuffer);
  });
};

// GET /api/company/settings - Buscar configurações da empresa
export const getCompanySettings = async (req, res) => {
  try {
    const company = await Company.findOne({ publicId: req.companyPublicId })
      .select('name slogan theme settings plan contact social logo');

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Empresa não encontrada'
      });
    }

    const responseData = {
      name: company.name,
      slogan: company.slogan,
      primaryColor: company.theme?.primaryColor || '#3B82F6',
      secondaryColor: company.theme?.secondaryColor || '#1E40AF',
      plan: company.plan,
      language: company.settings?.language || 'pt-BR',
      contact: company.contact || {},
      social: company.social || {},
      logo: company.logo?.url || null
    };

    res.json({ success: true, data: responseData });
  } catch (error) {
    console.error('Erro ao buscar configurações:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
};

export const updateCompanySettings = async (req, res) => {
  try {
    // === 1. PARSEAR CAMPOS JSON (contact, social) ===
    const body = {};
    for (const key in req.body) {
      body[key] = parseIfJson(req.body[key]);
    }

    const {
      name,
      slogan,
      primaryColor,
      secondaryColor,
      language,
      contact = {},
      social = {},
      removeLogo
    } = body;

    const company = await Company.findOne({ publicId: req.companyPublicId });
    if (!company) {
      return res.status(404).json({ success: false, message: 'Empresa não encontrada' });
    }

    // === VALIDAÇÕES ===
    if (name && name.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Nome deve ter pelo menos 2 caracteres' });
    }

    if (primaryColor && !isValidColor(primaryColor)) {
      return res.status(400).json({ success: false, message: 'Cor primária inválida' });
    }

    if (secondaryColor && !isValidColor(secondaryColor)) {
      return res.status(400).json({ success: false, message: 'Cor secundária inválida' });
    }

    const updates = {};

    if (name !== undefined) updates.name = name.trim();
    if (slogan !== undefined) updates.slogan = slogan.trim();
    if (language !== undefined) {
      updates.settings = { ...company.settings, language };
    }
    if (primaryColor !== undefined || secondaryColor !== undefined) {
      updates.theme = {
        primaryColor: primaryColor || company.theme?.primaryColor || '#3B82F6',
        secondaryColor: secondaryColor || company.theme?.secondaryColor || '#1E40AF'
      };
    }

    updates.contact = {
      email: contact.email || '',
      phone: contact.phone || '',
      address: contact.address || ''
    };

    updates.social = {
      instagram: social.instagram || '',
      facebook: social.facebook || '',
      whatsapp: social.whatsapp || ''
    };

    // === UPLOAD DO LOGO ===
    if (req.files?.logo) {
      const file = req.files.logo;
      if (file.size > 2 * 1024 * 1024) {
        return res.status(400).json({ success: false, message: 'Arquivo muito grande. Máximo 2MB.' });
      }

      try {
        const result = await uploadToCloudinary(file.data);
        updates.logo = { url: result.secure_url, publicId: result.public_id };
      } catch (uploadError) {
        console.error('Erro no upload Cloudinary:', uploadError);
        return res.status(500).json({ success: false, message: 'Erro ao fazer upload da imagem' });
      }
    }

    // === REMOVER LOGO ===
    if (removeLogo === 'true' && company.logo?.publicId) {
      try {
        await cloudinary.uploader.destroy(company.logo.publicId);
      } catch (err) {
        console.warn('Erro ao deletar imagem antiga:', err);
      }
      updates.logo = null;
    }

    // === SALVAR ===
    Object.assign(company, updates);
    await company.save();

    res.json({
      success: true,
      message: 'Configurações atualizadas com sucesso',
      data: {
        name: company.name,
        slogan: company.slogan,
        logo: company.logo?.url || null,
        primaryColor: company.theme.primaryColor,
        secondaryColor: company.theme.secondaryColor,
        language: company.settings.language,
        contact: company.contact,
        social: company.social
      }
    });
  } catch (error) {
    console.error('Erro ao atualizar configurações:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
};



export const getPlanInfo = async (req, res) => {
  try {
    const company = await Company.findOne({ publicId: req.companyPublicId })
      .select('plan billing settings');
    
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Empresa não encontrada'
      });
    }

    const planInfo = {
      currentPlan: company.plan,
      status: company.billing?.status || 'active',
      nextBillingDate: company.billing?.nextBillingDate,
      maxUsers: company.settings?.maxUsers || 5,
      features: getPlanFeatures(company.plan)
    };

    res.json({
      success: true,
      data: planInfo
    });
  } catch (error) {
    console.error('Erro ao buscar informações do plano:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};

// PUT /api/company/plan - Atualizar plano (simulação)
export const updatePlan = async (req, res) => {
  try {
    const { plan } = req.body;

    if (!['free', 'pro', 'enterprise'].includes(plan)) {
      return res.status(400).json({
        success: false,
        message: 'Plano inválido'
      });
    }

    const company = await Company.findOne({ publicId: req.companyPublicId });
    
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Empresa não encontrada'
      });
    }

    company.plan = plan;
    
    // Atualizar configurações baseadas no plano
    if (plan === 'free') {
      company.settings.maxUsers = 5;
    } else if (plan === 'pro') {
      company.settings.maxUsers = 50;
    } else if (plan === 'enterprise') {
      company.settings.maxUsers = 9999; // Ilimitado
    }

    await company.save();

    res.json({
      success: true,
      message: `Plano atualizado para ${plan}`,
      data: {
        plan: company.plan,
        maxUsers: company.settings.maxUsers
      }
    });
  } catch (error) {
    console.error('Erro ao atualizar plano:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};


function getPlanFeatures(plan) {
  const features = {
    free: ['Até 50 alunos', '1 administrador', 'Suporte básico'],
    pro: ['Alunos ilimitados', '3 administradores', 'Suporte prioritário', 'Relatórios avançados'],
    enterprise: ['Alunos ilimitados', 'Administradores ilimitados', 'Suporte 24/7', 'API personalizada', 'White-label']
  };
  
  return features[plan] || features.free;
}