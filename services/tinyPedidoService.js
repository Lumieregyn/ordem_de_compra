const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';
const MAX_PAGINAS = 30;

/**
 * Busca o ID interno do pedido Tiny com base no número
 */
async function buscarIdPedidoPorNumero(numeroPedido) {
  const token = getAccessToken();
  if (!token) throw new Error('Token de acesso à API Tiny não disponível');

  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const url = `${TINY_API_V3_BASE}/pedidos?page=${page}&limit=50`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const lista = response.data?.pedidos || [];

    const encontrado = lista.find(p => `${p.numero}` === `${numeroPedido}`);
    if (encontrado) {
      return encontrado.id;
    }

    if (lista.length === 0) break;
  }

  throw new Error(`Pedido número ${numeroPedido} não encontrado na listagem.`);
}

/**
 * Busca os dados completos de um pedido Tiny pelo número oficial (usando GET /pedidos/{id})
 */
async function getPedidoCompletoByNumero(numeroPedido) {
  const token = getAccessToken();
  if (!token) throw new Error('Token de acesso à API Tiny não disponível');

  try {
    const idPedido = await buscarIdPedidoPorNumero(numeroPedido);
    const url = `${TINY_API_V3_BASE}/pedidos/${idPedido}`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const pedido = response.data?.pedido;
    if (!pedido) throw new Error(`Pedido ID ${idPedido} não encontrado na Tiny.`);

    return pedido;

  } catch (err) {
    console.error(`❌ Erro ao buscar pedido ${numeroPedido}:`, err.message);
    throw err;
  }
}

module.exports = {
  getPedidoCompletoByNumero
};
