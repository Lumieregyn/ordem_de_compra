// services/tinyProductService.js
const axios = require('axios');
const { getAccessToken } = require('./tokenService');

/** =================== Config =================== **/
const V3_BASE = process.env.TINY_V3_BASE_URL || 'https://erp.tiny.com.br/public-api/v3';

// Retries / Backoff
const MAX_RETRIES = Number(process.env.TINY_V3_MAX_RETRIES || 5);
const BACKOFF_BASE_MS = Number(process.env.TINY_V3_BACKOFF_BASE_MS || 600);

// Throttling
const PAGE_DELAY_MS = Number(process.env.TINY_V3_PAGE_DELAY_MS || 400);
const REQ_DELAY_MS  = Number(process.env.TINY_V3_REQUEST_DELAY_MS || 250);

// Listagem
const PAGE_SIZE = Number(process.env.TINY_V3_PAGE_SIZE || 50);
const MAX_PAGES = Number(process.env.TINY_V3_MAX_PAGES || 0); // 0 = sem limite

/** =================== Utils =================== **/
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => Math.floor(ms * (0.85 + Math.random() * 0.3));

async function getTokenOrNull() {
  try {
    const token = await getAccessToken();
    if (!token) {
      console.warn('⚠️ Token da Tiny não encontrado.');
      return null;
    }
    return token;
  } catch (err) {
    console.error('❌ Erro ao obter token do Redis:', err.message);
    return null;
  }
}

async function axiosGetWithRetry(url, { headers = {}, params = {} } = {}) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await axios.get(url, {
        headers,
        params,
        validateStatus: () => true, // vamos tratar status manualmente
      });

      const { status } = resp;

      if (status === 200) {
        // Respeita um pequeno delay para evitar 429 em rajada
        if (REQ_DELAY_MS > 0) await sleep(REQ_DELAY_MS);
        return resp;
      }

      // Re-tentáveis
      if ([429, 502, 503].includes(status)) {
        const delay = jitter(BACKOFF_BASE_MS * Math.pow(2, attempt - 1));
        console.warn(`⏳ ${status} em GET ${url}. Retry ${attempt}/${MAX_RETRIES} em ${delay}ms`);
        await sleep(delay);
        continue;
      }

      // Não re-tentáveis
      console.error(`❌ GET ${url} retornou status ${status}`, resp.data);
      return resp;
    } catch (err) {
      // Erros de rede / timeout → re-tentáveis
      const delay = jitter(BACKOFF_BASE_MS * Math.pow(2, attempt - 1));
      console.warn(`⚠️ Falha de rede em GET ${url} (tentativa ${attempt}). Retry em ${delay}ms: ${err.message}`);
      await sleep(delay);
    }
  }

  throw new Error(`Falha definitiva em GET ${url} após ${MAX_RETRIES} tentativas`);
}

/** =================== Listagem paginada =================== **/
async function listarProdutosTiny() {
  const token = await getTokenOrNull();
  if (!token) return [];

  const produtos = [];
  let pagina = 1;

  try {
    while (true) {
      console.log(`🔄 Buscando produtos - Página ${pagina}`);

      const resp = await axiosGetWithRetry(`${V3_BASE}/produtos`, {
        headers: { Authorization: `Bearer ${token}` },
        // Mantém os nomes dos params que você já usa hoje
        params: { pagina, tamanhoPagina: PAGE_SIZE },
      });

      const body = resp?.data || {};
      const itens = Array.isArray(body?.itens) ? body.itens : [];

      if (itens.length === 0) break;

      for (const item of itens) {
        produtos.push({
          id: item.id,
          sku: item.sku,
          marca: item.marca?.nome || null,
        });
      }

      // Parada por limite opcional
      pagina++;
      if (MAX_PAGES > 0 && pagina > MAX_PAGES) break;

      // Evita 429 entre páginas
      if (PAGE_DELAY_MS > 0) await sleep(PAGE_DELAY_MS);
    }

    console.log(`✅ ${produtos.length} produtos carregados da Tiny`);
    return produtos;
  } catch (err) {
    console.error('❌ Erro ao buscar produtos da Tiny:', err.message);
    return [];
  }
}

/** =================== Consulta individual =================== **/
async function getProdutoFromTinyV3(produtoId) {
  console.log(`🔍 Buscando produto ID: ${produtoId}`);

  const token = await getTokenOrNull();
  if (!token) return null;

  const url = `${V3_BASE}/produtos/${produtoId}`;

  try {
    const resp = await axiosGetWithRetry(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (resp.status === 200 && resp.data) {
      console.log(`✅ Produto ID ${produtoId} carregado com sucesso`);
      return resp.data;
    }

    // Se chegou aqui, status não-200 não re-tentável já foi logado no helper
    return null;
  } catch (error) {
    console.error(`❌ Erro ao buscar produto ID ${produtoId}:`, error.message);
    return null;
  }
}

module.exports = {
  listarProdutosTiny,
  getProdutoFromTinyV3,
};
