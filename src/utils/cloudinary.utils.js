// utils/cloudinary.utils.js
import cloudinary from '../config/cloudinary.js';

// Função para upload de mídia de exercícios
export const uploadExerciseMediaToCloudinary = async (fileBuffer, originalName) => {
  const extension = originalName.split('.').pop().toLowerCase();
  const isVideo = ['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(extension);
  const isGif = extension === 'gif';
  
  const resourceType = isVideo ? 'video' : (isGif ? 'image' : 'image');
  
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'exercise-media',
        resource_type: resourceType,
        // Configurações para vídeos
        ...(isVideo && {
          format: 'mp4',
          transformation: [
            { width: 640, height: 360, crop: 'limit' },
            { quality: 'auto' },
            { fetch_format: 'mp4' }
          ]
        }),
        // Configurações para GIFs
        ...(isGif && {
          format: 'gif',
          transformation: [
            { width: 400, height: 400, crop: 'limit' },
            { quality: 'auto' }
          ]
        }),
        // Configurações para imagens
        ...(!isVideo && !isGif && {
          format: 'webp',
          transformation: [
            { width: 400, height: 400, crop: 'limit' },
            { quality: 'auto' },
            { fetch_format: 'webp' }
          ]
        })
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(fileBuffer);
  });
};

// Função para deletar mídia do Cloudinary
export const deleteFromCloudinary = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.warn('Erro ao deletar do Cloudinary:', error);
  }
};