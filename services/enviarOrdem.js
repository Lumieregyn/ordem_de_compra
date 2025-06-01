const axios = require('axios');
const { getAccessToken } = require('./tokenService');

/**
 * Envia uma Ordem de Compra para a API Tiny v3.
 * Valida campos obrigatórios antes do envio.
 * @param {Object} payload - JSON completo da ordem de compra
 * @returns {Object|null} - Resposta da Tiny ou null em erro crítico
 */
async function enviarOrdemCompra(payload) {
  const problemas = [];

  // 🔍 Validação de estrutura mínima
  if (!payload) {
    problemas.push('payload ausente');
  } else {
    if (!payload.contato?.id || payload.contato.id <= 0) {
      problemas.push('contato.id ausente ou inválido');
    }

    if (!Array.isArray(payload.itens) || payload.itens.length === 0) {
      problemas.push('itens ausentes ou vazios');
    } else {
      payload.itens.forEach((item, index) => {
        if (!item?.produto?.id || item.produto.id <= 0) {
          problemas.push(`itens[${index}].produto.id ausente ou inválido`);
        }
      });
    }
  }

  // 🚫 Retorna erro se houver problemas detectados
  if (problemas.length > 0) {
    console.warn('[OC ⚠️] Payload incompleto no Bloco 5:', {
      problemas,
      dadosRecebidos: payload,
    });

    return {
      erro: 'payload-incompleto',
      problemas,
      dadosRecebidos: payload,
    };
  }

  // 🚀 Envio real para a API Tiny
  try {
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
      const { id, numero_pedido } = data.retorno.ordem_compra;
      console.log(`[OC ✅] Ordem de Compra criada com sucesso: ID ${id}, Pedido ${numero_pedido}`);
    } else {
      console.warn('[OC ⚠️] Erro no envio da OC:', {
        status,
        mensagem: data?.mensagem,
        detalhes: data?.detalhes || data?.retorno?.erros || [],
      });
    }

    return data;

  } catch (err) {
    console.error('[OC ❌] Erro inesperado ao enviar OC:', err.message);
    return null;
  }
}

module.exports = { enviarOrdemCompra };
