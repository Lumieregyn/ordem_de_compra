const axios = require('axios');
const { getAccessToken } = require('./tokenService');

/**
 * Envia uma Ordem de Compra para a API Tiny v3.
 * Faz validações obrigatórias antes do envio.
 * @param {Object} payload - JSON da ordem de compra (vindo do Bloco 4)
 * @returns {Object|null}
 */
async function enviarOrdemCompra(payload) {
  const problemas = [];

  if (!payload) {
    problemas.push('payload ausente');
  } else {
    if (!payload.contato?.id || payload.contato.id <= 0) {
      problemas.push('contato.id ausente ou inválido');
    }

    if (!Array.isArray(payload.itens) || payload.itens.length === 0) {
      problemas.push('itens ausentes ou vazios');
    } else {
      payload.itens.forEach((item, index) => {
        if (!item?.produto?.id || item.produto.id <= 0) {
          problemas.push(`itens[${index}].produto.id ausente ou inválido`);
        }
      });
    }
  }

  if (problemas.length > 0) {
    console.warn('[OC ⚠️] Payload incompleto no Bloco 5:', {
      problemas,
      dadosRecebidos: payload,
    });

    return {
      erro: 'payload-incompleto',
      problemas,
      dadosRecebidos: payload,
    };
  }

  try {
    const token = await getAccessToken();

    const response = await axios.post(
      'https://erp.tiny.com.br/public-api/v3/ordens-compra',
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        v
