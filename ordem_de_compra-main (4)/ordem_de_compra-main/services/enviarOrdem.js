const axios = require('axios');
const { getAccessToken } = require('./tokenService');
const { validarRespostaOrdem } = require('./validarRespostaOrdemService');

const MAX_RETRIES = 3;
const DELAY_BASE_MS = 1500;

/**
 * Envia uma Ordem de Compra para a API Tiny v3 com retry progressivo.
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

  // 🚀 Envio com retry progressivo
  let tentativa = 0;

  while (tentativa < MAX_RETRIES) {
    tentativa++;
    try {
      const token = await getAccessToken();

      const response = await axios.post(
        'https://api.tiny.com.br/public-api/v3/ordem-compra',
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
          validateStatus: () => true,
        }
      );

      const { status, data } = response;

      // 💡 Resposta inesperada mas não erro de rede
      if (status === 429 || status >= 500) {
        console.warn(`[OC 🔁] Tentativa ${tentativa} falhou (Status ${status}) - aguardando retry...`);
        await new Promise((res) => setTimeout(res, tentativa * DELAY_BASE_MS));
        continue;
      }

      const sucesso = validarRespostaOrdem(data);

      if (status === 200 && sucesso) {
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
      console.error(`[OC ❌] Erro na tentativa ${tentativa}: ${err.message}`);
      if (tentativa < MAX_RETRIES) {
        await new Promise((res) => setTimeout(res, tentativa * DELAY_BASE_MS));
      } else {
        return null;
      }
    }
  }

  console.error('[OC ❌] Todas as tentativas de envio falharam.');
  return null;
}

module.exports = { enviarOrdemCompra };
