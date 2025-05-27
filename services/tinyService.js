const axios = require('axios');
const pLimit = require('p-limit');
const { getProdutosCollection } = require('./mongoClient');
const { getAccessToken } = require('./tokenService');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';
const API_V2_LIST_URL  = 'https://api.tiny.com.br/api2/produtos.pesquisa.php';
const API_V2_TOKEN     = process.env.TINY_API_TOKEN;

const CONCURRENCY = 1;
const MAX_RETRIES = 3;
const BACKOFF_BASE = 1000; // ms

const marcasCache = new Map(); // Cache para evitar chamadas duplicadas
let chamadasV3 = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchMarcaV3(produtoId, retries = MAX_RETRIES) {
  if (marcasCache.has(produtoId)) {
    return marcasCache.get(produtoId);
  }

  const token = getAccessToken();
  if (!token) {
    console.warn('⚠️ TOKEN v3 ausente. Rode /auth → /callback primeiro.');
    return null;
  }

  chamadasV3++;
  try {
    const resp = await axios.get(
      `${TINY_API_V3_BASE}/produtos/${produtoId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const marca = resp.data.marca?.nome?.trim() || null;
    marcasCache.set(produtoId, marca);
    return marca;
  } catch (err) {
    const status = err.response?.status;
    if (status === 429 && retries > 0) {
      const delay = BACKOFF_BASE * Math.pow(2, MAX_RETRIES - retries);
      console.warn(`⚠️ Rate limit (429), retry em ${delay}ms`);
      await sleep(delay);
      return fetchMarcaV3(produtoId, retries - 1);
    }

    console.warn(`⚠️ Erro ao buscar marca v3 para ID ${produtoId}: ${status}`);
    return null;
  }
}

async function salvarOuAtualizarProduto({ codigo, nome, marca }) {
  if (!codigo || !nome || !marca) return;

  try {
    const collection = getProdutosCollection();
    await collection.updateOne(
      { codigo },
      { $set: { nome, marca, atualizado_em: new Date().toISOString() } },
      { upsert: true }
    );
  } catch (err) {
    console.error(`❌ Erro ao salvar produto ${codigo}:`, err);
  }
}

async function processarProdutosTiny() {
  let pagina = 1;
  let totalProdutos = 0;
  let totalMarcasValidas = 0;
  const inicio = Date.now();
  const limit = pLimit(CONCURRENCY);
  const contagemMarcas = {};

  while (true) {
    const response = await axios.post(API_V2_LIST_URL, null, {
      params: { token: API_V2_TOKEN, formato: 'json', pagina },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const produtos = response.data?.retorno?.produtos || [];
    if (!produtos.length) break;

    const marcasPagina = new Set();

    const tarefas = produtos.map(({ produto }) =>
      limit(async () => {
        totalProdutos++;
        const { codigo, nome, marca: marcaBruta, id } = produto;
        let marca = marcaBruta?.trim();

        if (!marca && id) {
          marca = await fetchMarcaV3(id);
        }

        if (!marca) {
          console.log(`❌ Marca ausente para código: ${codigo}`);
          return;
        }

        marcasPagina.add(marca);
        contagemMarcas[marca] = (contagemMarcas[marca] || 0) + 1;
        await salvarOuAtualizarProduto({ codigo, nome: nome?.trim(), marca });
      })
    );

    await Promise.all(tarefas);
    totalMarcasValidas += marcasPagina.size;
    pagina++;
  }

  const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
  return {
    paginas: pagina - 1,
    produtos: totalProdutos,
    marcasSalvas: totalMarcasValidas,
    tempo: duracao + 's',
    chamadasV3,
    topMarcas: Object.entries(contagemMarcas)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([marca, contagem]) => ({ marca, contagem }))
  };
}

module.exports = { processarProdutosTiny };
