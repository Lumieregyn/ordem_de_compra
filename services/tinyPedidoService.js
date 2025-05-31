const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';

/**
 * Obtém os dados completos de um pedido Tiny pelo ID oficial (ex: 734153635).
 * Esse ID é obtido diretamente do webhook no campo `dados.id`.
 *
 * @param {string|number} idPedido - ID interno do pedido (não é o número visível no painel)
 * @returns {Promise<Object>} - Objeto completo do pedido
 */
async function getPedidoCompletoById(idPedido) {
  const token = getAccessToken();

  if (!token) {
    console.error('❌ Token de acesso não encontrado. Verifique o fluxo OAuth.');
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

    // Log básico de conferência
    console.log(`✅ Pedido carregado com sucesso: número ${pedido.numero}, itens: ${pedido.itens?.length || 0}`);
    return pedido;

  } catch (error) {
    const status = error?.response?.status;
    const mensagem = error?.response?.data?.mensagem || error.message;

    console.error(`❌ Erro ao buscar pedido ${idPedido} | Status: ${status} | Mensagem: ${mensagem}`);
    throw new Error(`Erro ao buscar pedido ${idPedido}: ${mensagem}`);
  }
}

/**
 * Alias compatível para uso futuro (manter padrão de nomeação)
 */
module.exports = {
  getPedidoCompletoById
};
