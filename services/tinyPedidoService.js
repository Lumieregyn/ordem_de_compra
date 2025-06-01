const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';
const MAX_TENTATIVAS = 5;

/**
 * Busca os dados completos de um pedido Tiny usando o ID (entregue pelo webhook).
 * Compatível com a resposta atual da API Tiny (dados no nível raiz).
 */
async function getPedidoCompletoById(idPedido) {
  const token = getAccessToken();
  if (!token) throw new Error('Token de acesso à API Tiny não disponível');

  const url = `${TINY_API_V3_BASE}/pedidos/${idPedido}?completo=true`;

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      console.log(`📡 Buscando pedido completo via API V3: ID ${idPedido} (tentativa ${tentativa})`);

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: () => true // ✅ captura todos os status, mesmo erros
      });

      const pedido = response.data;

      if (!pedido || !pedido.id || !pedido.numeroPedido || !pedido.itens) {
        console.warn(`⚠️ Pedido ID ${idPedido} retornou incompleto. Log completo da resposta:`);
        console.dir(response.data, { depth: null });
        throw new Error(`Pedido ID ${idPedido} retornou incompleto ou inválido.`);
      }

      console.log(`✅ Pedido ${pedido.numeroPedido} carregado com sucesso (ID: ${idPedido})`);
      return pedido;

    } catch (error) {
      const status = error?.response?.status || 'desconhecido';
      const msg = error?.message || 'Erro inesperado';

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
