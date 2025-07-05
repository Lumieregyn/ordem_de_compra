const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';
const MAX_TENTATIVAS = 5;

async function getPedidoCompletoById(id) {
  const token = await getAccessToken();
  if (!token) throw new Error('Token de acesso à API Tiny não disponível');

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      console.log(`📡 Buscando pedido completo via API V3: ID ${id} (tentativa ${tentativa})`);

      const url = `${TINY_API_V3_BASE}/pedidos/${id}?completo=true`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
        validateStatus: () => true, // Captura até erros de validação
      });

      const { status, data } = response;

      if (!data || typeof data !== 'object') {
        console.warn(`⚠️ Resposta inesperada (status ${status}) para pedido ${id}:`, data);
        throw new Error('Resposta malformada da API');
      }

      if (!data.id || !data.numeroPedido || !Array.isArray(data.itens)) {
        console.warn(`⚠️ Pedido ID ${id} retornou incompleto ou inválido.`, data);
        throw new Error(`Pedido ${id} incompleto`);
      }

      return data;

    } catch (err) {
      const espera = tentativa * 5000;
      const statusErro = err.response?.status || 'sem status';
      const msgErro = err.response?.data || err.message;

      console.warn(`⏳ Erro ao buscar pedido ID ${id} | Tentativa ${tentativa} | Status: ${statusErro} | ${msgErro}`);

      if (tentativa < MAX_TENTATIVAS) {
        await new Promise(resolve => setTimeout(resolve, espera));
      } else {
        console.error(`❌ Falha final ao buscar pedido ${id}:`, msgErro);
        throw err;
      }
    }
  }
}

module.exports = {
  getPedidoCompletoById,
  // ... outros exports existentes
};
