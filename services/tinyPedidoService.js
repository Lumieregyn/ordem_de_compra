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
        validateStatus: () => true, // ✅ captura mesmo status ≠ 200
      });

      const pedido = response.data;

      // 🔍 DEBUG opcional
      if (typeof pedido !== 'object' || Object.keys(pedido).length === 0) {
        console.warn(`⚠️ Pedido ID ${id} retornou resposta vazia ou em branco`);
      }

      if (!pedido || !pedido.id || !pedido.numeroPedido || !pedido.itens) {
        throw new Error(`Pedido ID ${id} retornou incompleto ou inválido.`);
      }

      return pedido;

    } catch (err) {
      const espera = tentativa * 5000; // espera progressiva: 5s, 10s, 15s...

      console.warn(`⏳ Erro ao buscar pedido ID ${id} | Tentativa ${tentativa} | Status: desconhecido | ${err.message}`);
      if (tentativa < MAX_TENTATIVAS) {
        await new Promise(resolve => setTimeout(resolve, espera));
      } else {
        console.error(`❌ Falha final ao buscar pedido ${id}: ${err.message}`);
        throw err;
      }
    }
  }
}

module.exports = {
  getPedidoCompletoById,
  // ... outros exports existentes, ex:
  // getPedidoCompletoByNumero
};
