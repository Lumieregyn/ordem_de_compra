const axios = require('axios');
const { getAccessToken } = require('./tokenService');

/**
 * Envia uma Ordem de Compra para a API Tiny v3.
 * @param {Object} payload - JSON completo da ordem de compra
 * @returns {Object|null} - Retorno da API Tiny ou null em caso de erro
 */
async function enviarOrdemCompra(payload) {
  try {
    const token = await getAccessToken();

    // Payload temporário (simulação caso não fornecido)
    const simulatedPayload = {
      fornecedor: { id: 123456 },
      data_prevista: '2025-06-05',
      itens: [
        {
          produto: { id: 987654 },
          quantidade: 2,
          valor_unitario: 150.0
        }
      ]
    };

    const finalPayload = payload && payload.itens ? payload : simulatedPayload;

    const response = await axios.post(
      'https://erp.tiny.com.br/public-api/v3/ordens-compra',
      finalPayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        validateStatus: () => true, // Captura todos os status HTTP
      }
    );

    const { status, data } = response;

    if (status === 200 && data?.retorno?.status === 'sucesso') {
      console.log(`[OC ✅] Ordem de Compra criada com sucesso: ID ${data.retorno.ordem_compra.id}`);
      return data;
    } else {
      console.warn('[OC ⚠️] Erro no envio da OC:', {
        status,
        mensagem: data?.mensagem,
        detalhes: data?.detalhes || data?.retorno?.erros || null,
      });
      return data;
    }
  } catch (err) {
    console.error('[OC ❌] Erro inesperado ao enviar OC:', err.message);
    return null;
  }
}

module.exports = { enviarOrdemCompra };
