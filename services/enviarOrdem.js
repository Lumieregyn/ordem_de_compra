// services/enviarOrdem.js
const axios = require('axios');
const { getAccessToken } = require('./tokenService');
const { validarRespostaOrdem } = require('./validarRespostaOrdemService');

const V3_BASE = process.env.TINY_V3_BASE_URL || 'https://erp.tiny.com.br/public-api/v3';
const MAX_RETRIES = Number(process.env.TINY_OC_MAX_RETRIES || 3);
const BACKOFF_BASE_MS = Number(process.env.TINY_OC_BACKOFF_BASE_MS || 700);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => Math.floor(ms * (0.85 + Math.random() * 0.3));

async function postWithRetry(url, body, config = {}) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const resp = await axios.post(url, body, { validateStatus: () => true, ...config });
    const { status } = resp;

    if (status === 200 || status === 201) return resp;

    if ([429, 502, 503].includes(status) && attempt < MAX_RETRIES) {
      const delay = jitter(BACKOFF_BASE_MS * Math.pow(2, attempt - 1));
      console.warn(`⏳ ${status} ao enviar OC. Tentativa ${attempt}/${MAX_RETRIES} — retry em ${delay}ms`);
      await sleep(delay);
      continue;
    }
    return resp; // não re-tentável
  }
  throw new Error(`Falha definitiva ao enviar OC após ${MAX_RETRIES} tentativas`);
}

/**
 * Envia uma Ordem de Compra para a API Tiny v3.
 * @param {Object} payload - JSON completo da ordem de compra
 * @returns {Object|null} - Resposta da Tiny ou null em erro crítico
 */
async function enviarOrdemCompra(payload) {
  const problemas = [];

  if (!payload) {
    problemas.push('payload ausente');
  } else {
    if (!payload.contato?.id || Number(payload.contato.id) <= 0) {
      problemas.push('contato.id ausente ou inválido');
    }
    if (!Array.isArray(payload.itens) || payload.itens.length === 0) {
      problemas.push('itens ausentes ou vazios');
    } else {
      payload.itens.forEach((item, index) => {
        if (!item?.produto?.id || Number(item.produto.id) <= 0) {
          problemas.push(`itens[${index}].produto.id ausente ou inválido`);
        }
        if (!(Number(item?.quantidade) > 0)) {
          problemas.push(`itens[${index}].quantidade ausente ou inválida`);
        }
        if (!(Number(item?.valor) > 0)) {
          problemas.push(`itens[${index}].valor ausente ou inválido`);
        }
      });
    }
  }

  if (problemas.length > 0) {
    console.warn('[OC ⚠️] Payload incompleto no Bloco 5:', { problemas, dadosRecebidos: payload });
    return { erro: 'payload-incompleto', problemas, dadosRecebidos: payload };
  }

  try {
    const token = await getAccessToken();
    const url = `${V3_BASE}/ordens-compra`;

    const resp = await postWithRetry(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const { status, data } = resp;
    const sucesso = (status === 200 || status === 201) && validarRespostaOrdem(data);

    if (sucesso) {
      // tenta extrair identificadores em formatos V3 e V2
      const id =
        data?.id ||
        data?.ordem_compra?.id ||
        data?.ordemCompra?.id ||
        data?.retorno?.ordem_compra?.id;

      const numero =
        data?.numero ||
        data?.numero_pedido ||
        data?.ordem_compra?.numero ||
        data?.ordem_compra?.numero_pedido ||
        data?.retorno?.ordem_compra?.numero_pedido;

      console.log(`[OC ✅] Ordem de Compra criada${id ? ` (ID ${id})` : ''}${numero ? `, nº ${numero}` : ''}.`);
    } else {
      console.warn('[OC ⚠️] Erro no envio da OC:', {
        status,
        mensagem: data?.mensagem || data?.message,
        detalhes: data?.detalhes || data?.errors || data?.retorno?.erros || [],
        corpo: data,
      });
    }

    return data;
  } catch (err) {
    console.error('[OC ❌] Erro inesperado ao enviar OC:', err.message);
    return null;
  }
}

module.exports = { enviarOrdemCompra };
