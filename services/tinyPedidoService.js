const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';

/**
 * Busca os dados completos de um pedido Tiny pelo ID real.
 * Esse ID é recebido diretamente do webhook no campo `dados.id`.
 * 
 * @param {string|number} idPedido - ID real do pedido na API Tiny v3
 * @returns {Promise<Object>} - Objeto completo do pedido
 */
async function getPedidoCompletoById(idPedido) {
  const token = getAccessToken();

  if (!token) {
    console.error('❌ Token de acesso à API Tiny não disponível.');
    throw new Error('Token de acesso ausente.');
  }

  const url = `${TINY_API_V3_BASE}/pedidos/${idPedido}`;

  try {
    console.log(`📡 Buscando pedido completo via API V3 (ID: ${idPedido})...`);

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const pedido = response.data?.pedido;

    if (!pedido) {
      console.warn(`⚠️ Pedido ID ${idPedido} retornou vazio na API.`);
      throw new Error(`Pedido ID ${idPedido} não encontrado ou inválido.`);
    }

    console.log(`✅ Pedido carregado com sucesso: número ${pedido.numero}, itens: ${pedido.itens?.length || 0}`);
    return pedido;

  } catch (error) {
    const status = error?.response?.status;
    const mensagem = error?.response?.data?.mensagem || error.message;

    console.error(`❌ Erro ao buscar pedido ID ${idPedido} | Status: ${status} | Mensagem: ${mensagem}`);
    throw new Error(`Erro ao buscar pedido ID ${idPedido}: ${mensagem}`);
  }
}

module.exports = {
  getPedidoCompletoById
};
