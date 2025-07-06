// services/whatsAppService.js

const axios = require('axios');

const API_URL = process.env.WHATSAPP_API_URL;
const ALERTA_ATIVO = process.env.WHATSAPP_ALERTA_ATIVO === 'true';
const GRUPO_ID = process.env.WHATSAPP_GRUPO_ID || '12036xxxxxxxx@g.us';

/**
 * Envia mensagem de erro crítico para grupo de WhatsApp
 * @param {string} mensagem - Texto da mensagem a ser enviada
 */
async function enviarWhatsappErro(mensagem) {
  if (!ALERTA_ATIVO) return;

  const payload = {
    number: GRUPO_ID,
    message: mensagem,
  };

  try {
    const response = await axios.post(API_URL, payload, {
      timeout: 5000,
    });

    if (response.status === 200) {
      console.log('✅ WhatsApp enviado ao grupo:', GRUPO_ID);
    } else {
      console.warn('⚠️ Erro ao enviar WhatsApp:', response.status, response.data);
    }
  } catch (err) {
    console.error('❌ Erro ao enviar WhatsApp (ignorado):', err.message);
  }
}

module.exports = { enviarWhatsappErro };
