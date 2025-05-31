const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';
const MAX_PAGINAS = 30;
const MAX_TENTATIVAS = 5;

/**
 * Busca o ID do pedido Tiny com base no número visível
 */
async function buscarIdPedidoPorNumero(numeroPedido) {
  const token = getAccessToken();
  if (!token) throw new Error('Token de acesso à API Tiny não disponível');

  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const url = `${TINY_API_V3_BASE}/pedidos?completo=true&page=${page}&limit=50`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const lista = response.data?.pedidos || [];

    const numerosNaPagina = lista.map(p => p.numero).join(', ');
    console.log(`📄 Página ${page} – Números encontrados: [${numerosNaPagina}]`);

    const encontrado = lista.find(p => `${p.numero}` === `${numeroPedido}`);
    if (encontrado) {
      console.log(`🔗 Match encontrado: Pedido ${numeroPedido} => ID ${encontrado.id}`);
      return encontrado.id;
    }

    if (lista.length === 0) break;
  }

  return null; // permite que o retry funcione no nível acima
}

/**
 * Busca os dados completos de um pedido usando o número visível do Tiny.
 * Internamente localiza o ID correto e usa o endpoint /pedidos/{id}
 * Com retry progressivo automático (até 5 vezes, com delay crescente)
 */
async function getPedidoCompletoByNumero(numeroPedido) {
  const token = getAccessToken();
  if (!token) throw new Error('Token de acesso à API Tiny não disponível');

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const idPedido = await buscarIdPedidoPorNumero(numeroPedido);

      if (!idPedido) {
        throw new Error(`Pedido número ${numeroPedido} ainda não disponível na listagem.`);
      }

      const url = `${TINY_API_V3_BASE}/pedidos/${idPedido}`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const pedido = response.data?.pedido;
      if (!pedido) throw new Error(`Pedido ID ${idPedido} retornou nulo.`);

      console.log(`✅ Pedido ${numeroPedido} carregado com sucesso via API (ID real: ${idPedido})`);
      return pedido;

    } catch (err) {
      if (tentativa < MAX_TENTATIVAS) {
        const espera = tentativa * 7000; // 7s, 14s, 21s, etc.
        console.warn(`⏳ Tentativa ${tentativa} falhou para pedido ${numeroPedido}. Nova tentativa em ${espera / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, espera));
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
