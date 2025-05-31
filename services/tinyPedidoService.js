const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';
const MAX_PAGINAS = 30;

/**
 * Busca o ID do pedido Tiny com base no número visível (ex: 13036).
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

    const numerosNaPagina = lista.map(p => p.numero).join(', ');
    console.log(`📄 Página ${page} – Números encontrados: [${numerosNaPagina}]`);

    const encontrado = lista.find(p => `${p.numero}` === `${numeroPedido}`);
    if (encontrado) {
      console.log(`🔗 ID real do pedido ${numeroPedido} é ${encontrado.id}`);
      return encontrado.id;
    }

    if (lista.length === 0) break;
  }

  throw new Error(`Pedido número ${numeroPedido} não encontrado na listagem da API.`);
}

/**
 * Busca os dados completos de um pedido usando o número visível do Tiny.
 * Internamente localiza o ID correto e usa o endpoint /pedidos/{id}
 */
async function getPedidoCompletoByNumero(numeroPedido) {
  const token = getAccessToken();
  if (!token) throw new Error('Token de acesso à API Tiny não disponível');

  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const idPedido = await buscarIdPedidoPorNumero(numeroPedido);
      const url = `${TINY_API_V3_BASE}/pedidos/${idPedido}`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const pedido = response.data?.pedido;
      if (!pedido) throw new Error(`Pedido ID ${idPedido} retornou nulo.`);

      console.log(`✅ Pedido ${numeroPedido} carregado com sucesso via API (ID real: ${idPedido})`);
      return pedido;

    } catch (err) {
      if (tentativa < 3) {
        console.warn(`⏳ Tentativa ${tentativa} falhou para pedido ${numeroPedido}. Tentando novamente em 5s...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else {
        console.error(`❌ Falha final ao buscar pedido ${numeroPedido}: ${err.message}`);
        throw err;
      }
    }
  }
}

module.exports = {
  getPedidoCompletoByNumero
};
