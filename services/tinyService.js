const axios = require('axios');
const pLimit = require('p-limit');
const { getProdutosCollection } = require('./mongoClient');
const { getAccessToken } = require('./tokenService');
const { inferirMarcaViaIA } = require('./aiBrandInferenceService');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';
const API_V2_LIST_URL = 'https://api.tiny.com.br/api2/produtos.pesquisa.php';
const API_V2_TOKEN = process.env.TINY_API_TOKEN;

const CONCURRENCY = 1;
const MAX_RETRIES = 3;
const BACKOFF_BASE = 1000;
const MAX_FALLOWS = 50;

const marcasCache = new Map();
let chamadasV3 = 0;
let fallbacksUsados = 0;

function extrairMarcaComHeuristica(produto, marcasConhecidas = []) {
  const fontesTexto = [
    produto.nome,
    produto.descricao,
    produto.descricaoComplementar,
    produto.observacoes,
    produto.categoria?.nome,
    produto.categoria?.caminhoCompleto,
    ...(produto.atributos || []).map(a => `${a.nome}: ${a.valor}`)
  ];

  for (const texto of fontesTexto) {
    if (!texto) continue;
    const textoNorm = texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    for (const marca of marcasConhecidas) {
      const marcaNorm = marca.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
      if (textoNorm.includes(marcaNorm)) {
        return marca;
      }
    }
  }

  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchMarcaV3(produtoId, marcasConhecidas = [], retries = MAX_RETRIES) {
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

    const produto = resp.data;
    console.log(`📦 Produto ${produto.sku || 'sem SKU'} retornado da v3: marca direta =`, produto.marca?.nome);

    let marca = produto.marca?.nome?.trim();

    if (!marca) {
      marca = extrairMarcaComHeuristica(produto, marcasConhecidas);
      if (marca) {
        console.log(`✅ Marca inferida com heurística: ${marca}`);
      } else {
        marca = await inferirMarcaViaIA(produto);
        if (marca) {
          console.log(`✅ Marca inferida via IA: ${marca}`);
        } else {
          console.log(`❌ Nenhuma marca inferida via IA para ${produto.sku || 'sem SKU'}`);
        }
      }
    }

    marcasCache.set(produtoId, marca || null);
    return marca;
  } catch (err) {
    const status = err.response?.status;
    if (status === 429 && retries > 0) {
      const delay = BACKOFF_BASE * Math.pow(2, MAX_RETRIES - retries);
      console.warn(`⚠️ Rate limit (429), retry em ${delay}ms`);
      await sleep(delay);
      return fetchMarcaV3(produtoId, marcasConhecidas, retries - 1);
    }

    console.warn(`⚠️ Erro ao buscar marca v3 para ID ${produtoId}: ${status}`);
    return null;
  }
}

async function salvarOuAtualizarProduto({ codigo, nome, marca }) {
  if (!codigo || !nome) return;

  try {
    const collection = getProdutosCollection();
    await collection.updateOne(
      { codigo },
      {
        $set: {
          nome,
          marca: marca || null,
          atualizado_em: new Date().toISOString()
        }
      },
      { upsert: true }
    );

    console.log(`💾 Produto salvo: ${codigo} | Marca: ${marca || 'N/A'}`);
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

  const marcasConhecidas = await getProdutosCollection()
    .distinct('marca', { marca: { $ne: null } });

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
          console.log(`🔎 Produto sem marca direta: ${codigo} → tentando fallback com id ${id}`);

          if (fallbacksUsados >= MAX_FALLOWS) {
            console.log(`⏳ Fallback v3 ignorado (limite de ${MAX_FALLOWS} atingido) para código: ${codigo}`);
          } else {
            marca = await fetchMarcaV3(id, marcasConhecidas);
            fallbacksUsados++;
          }
        }

        if (!marca) {
          console.log(`❌ Marca ausente para código: ${codigo}`);
        } else {
          marcasPagina.add(marca);
          contagemMarcas[marca] = (contagemMarcas[marca] || 0) + 1;
        }

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
    fallbacksUsados,
    topMarcas: Object.entries(contagemMarcas)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([marca, contagem]) => ({ marca, contagem }))
  };
}

module.exports = { processarProdutosTiny };
