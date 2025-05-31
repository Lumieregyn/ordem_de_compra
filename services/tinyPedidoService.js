const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';

/**
 * Busca os dados completos de um pedido Tiny pelo número via API V3.
 * Usa o endpoint: GET /pedidos?numero=12345
 * 
 * @param {string|number} numeroPedido 
 * @returns {Promise<Object>} Pedido completo (com itens)
 */
async function getPedidoCompletoByNumero(numeroPedido) {
  const token = getAccessToken();
  if (!token) throw new Error('Token de acesso à API Tiny não disponível');

  try {
    const url = `${TINY_API_V3_BASE}/pedidos?numero=${numeroPedido}`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const pedido = response.data?.pedidos?.[0];
    if (!pedido) throw new Error(`Pedido número ${numeroPedido} não encontrado na Tiny.`);

    return pedido;

  } catch (err) {
    console.error(`❌ Erro ao buscar pedido ${numeroPedido}:`, err.message);
    throw err;
  }
}

module.exports = {
  getPedidoCompletoByNumero
};
