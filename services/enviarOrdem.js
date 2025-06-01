const axios = require('axios');
const { getAccessToken } = require('./tokenService');

/**
 * Envia uma ordem de compra para a API Tiny v3 (JSON + OAuth2)
 * @param {Object} payload JSON completo da ordem de compra (vindo do Bloco 4)
 * @returns {Object} resultado padronizado com sucesso ou erro
 */
async function enviarOrdemCompra(payload) {
  try {
    if (!payload || typeof payload !== 'object' || !payload.itens?.length) {
      return {
        sucesso: false,
        erro: 'validação',
        mensagem: 'Payload inválido ou sem itens'
      };
    }

    const token = await getAccessToken();

    const response = await axios.post(
      'https://erp.tiny.com.br/public-api/v3/ordens-compra',
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        validateStatus: () => true,
      }
    );

    const { status, data } = response;

    if (status === 200 && data?.retorno?.status === 'sucesso') {
      const ordemCompra = data.retorno.ordem_compra;
      console.log(`[OC Enviada ✅] OC criada com ID ${ordemCompra.id}, Pedido ${ordemCompra.numero_pedido}`);
      return {
        sucesso: true,
        idOrdemCompra: ordemCompra.id,
        numero: ordemCompra.numero_pedido,
        mensagem: 'Ordem de Compra criada com sucesso'
      };
    }

    const mensagem = data?.mensagem || data?.retorno?.status || 'Erro no envio';
    const detalhes = data?.detalhes || data?.retorno?.erros || [];

    console.warn(`[OC Erro ⚠️] Falha ao enviar OC. Status ${status} | Mensagem: ${mensagem}`);
    if (detalhes.length) console.warn('Detalhes do erro:', detalhes);

    return {
      sucesso: false,
      erro: 'validacao',
      mensagem,
      detalhes
    };

  } catch (err) {
    console.error(`[OC Erro ❌] Erro inesperado:`, err.message);
    return {
      sucesso: false,
      erro: 'falha',
      mensagem: err.message || 'Erro inesperado ao enviar Ordem de Compra'
    };
  }
}

module.exports = { enviarOrdemCompra }; // 👈 exportação correta
