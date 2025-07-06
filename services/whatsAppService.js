// services/whatsAppService.js

const axios = require('axios');

const API_URL = process.env.WHATSAPP_API_URL;
const ALERTA_ATIVO = process.env.WHATSAPP_ALERTA_ATIVO === 'true';
const GRUPO_ID = process.env.WHATSAPP_GRUPO_ID || '12036xxxxxxxx@g.us';

/**
 * Envia mensagem (de erro ou sucesso) para grupo no WhatsApp.
 * Pode ser usada para qualquer tipo de alerta.
 * @param {string} mensagem - Texto da mensagem a ser enviada.
 */
async function enviarWhatsappErro(mensagem) {
  if (!ALERTA_ATIVO) {
    console.log('ℹ️ WhatsApp desativado por configuração (WHATSAPP_ALERTA_ATIVO=false)');
    return;
  }

  if (!API_URL || !GRUPO_ID) {
    console.error('❌ Configuração incompleta do WhatsApp (API_URL ou GRUPO_ID ausente)');
    return;
  }

  const payload = {
    number: GRUPO_ID,
    message: mensagem,
  };

  try {
    const response = await axios.post(API_URL, payload, { timeout: 7000 });

    if (response.status === 200) {
      console.log('✅ WhatsApp enviado ao grupo:', GRUPO_ID);
    } else {
      console.warn('⚠️ Falha no envio do WhatsApp:', {
        status: response.status,
        data: response.data,
      });
    }
  } catch (err) {
    console.error('❌ Erro no envio via WhatsApp:', err.message);
  }
}

module.exports = { enviarWhatsappErro };
