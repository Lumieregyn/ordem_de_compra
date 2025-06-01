const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';

/**
 * Busca os dados completos de um pedido Tiny usando o ID real (entregue no webhook).
 * Usa: GET /pedidos/{id}?completo=true
 * 
 * @param {string|number} idPedido - ID do pedido entregue no webhook
 * @returns {Promise<Object>} - Objeto com dados completos do pedido
 */
async function getPedidoCompletoById(idPedido) {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Token de acesso à API Tiny não disponível');
  }

  const url = `${TINY_API_V3_BASE}/pedidos/${idPedido}?completo=true`;

  try {
    console.log(`📡 Buscando pedido completo via API V3: ID ${idPedido}...`);

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const pedido = response.data?.pedido;
    if (!pedido) {
      throw new Error(`Pedido ID ${idPedido} retornou vazio ou inválido.`);
    }

    console.log(`✅ Pedido ${pedido.numero} carregado com sucesso (ID: ${idPedido})`);
    return pedido;

  } catch (error) {
    const status = error?.response?.status || 'desconhecido';
    const msg = error?.response?.data?.mensagem || error.message;

    console.error(`❌ Erro ao buscar pedido ID ${idPedido} | Status: ${status} | Mensagem: ${msg}`);
    throw new Error(`Erro ao buscar pedido ${idPedido}: ${msg}`);
  }
}

module.exports = {
  getPedidoCompletoById
};
