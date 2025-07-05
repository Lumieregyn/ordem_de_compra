const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';

/**
 * Busca pedidos com status “Em rota de entrega”
 */
async function buscarPedidosEmRotaEntrega() {
  const token = await getAccessToken();

  const response = await axios.get(`${TINY_API_V3_BASE}/pedidos`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    params: {
      page: 1
    },
    timeout: 10000
  });

  const pedidos = response.data?.data?.pedidos || [];

  return pedidos.filter(p =>
    p.status?.toLowerCase().includes('rota') ||
    p.status_envio?.toLowerCase().includes('rota')
  );
}

module.exports = {
  buscarPedidosEmRotaEntrega
};
