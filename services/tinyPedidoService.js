const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';
const MAX_TENTATIVAS = 5;

/**
 * Busca os dados completos de um pedido Tiny usando o ID (via webhook).
 * Tenta automaticamente até 5 vezes com atraso progressivo.
 */
async function getPedidoCompletoById(idPedido) {
  const token = getAccessToken();
  if (!token) throw new Error('Token de acesso à API Tiny não disponível');

  const url = `${TINY_API_V3_BASE}/pedidos/${idPedido}?completo=true`;

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      console.log(`📡 Buscando pedido completo via API V3: ID ${idPedido} (tentativa ${tentativa})`);

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const pedido = response.data?.pedido;
      if (!pedido) throw new Error(`Pedido ID ${idPedido} retornou vazio ou inválido.`);

      console.log(`✅ Pedido carregado com sucesso (ID: ${idPedido})`);
      return pedido;

    } catch (error) {
      const status = error?.response?.status || 'desconhecido';
      const msg = error?.response?.data?.mensagem || error.message;

      console.warn(`⏳ Erro ao buscar pedido ID ${idPedido} | Tentativa ${tentativa} | Status: ${status} | ${msg}`);

      if (tentativa < MAX_TENTATIVAS) {
        const delay = tentativa * 5000;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw new Error(`Erro ao buscar pedido ${idPedido}: ${msg}`);
      }
    }
  }
}

module.exports = {
  getPedidoCompletoById
};
