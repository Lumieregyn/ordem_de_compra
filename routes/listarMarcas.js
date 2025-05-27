// routes/listarMarcas.js
// Handler de listagem de marcas via Tiny API v3 com retry/backoff e concurrency control

const axios = require('axios');
const pLimit = require('p-limit');
const { MongoClient } = require('mongodb');

// Configurações
const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';
const API_V2_LIST_URL = 'https://api.tiny.com.br/api2/produtos.pesquisa.php';
const API_V2_TOKEN = process.env.TINY_API_TOKEN;
const CONCURRENCY = 2;          // diminuir para evitar 429
const MAX_RETRIES = 3;
const BACKOFF_BASE = 500;       // ms

// Conexão com MongoDB
const mongoClient = new MongoClient(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
let produtosCollection;

mongoClient.connect()
  .then(() => {
    produtosCollection = mongoClient.db('ordens').collection('produtos');
    console.log('✅ [listarMarcas.js] Conectado ao MongoDB');
  })
  .catch(err => console.error('❌ [listarMarcas.js] Erro MongoDB:', err));

// Sleep util
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry with exponential backoff
async function fetchWithRetry(fn, retries = MAX_RETRIES) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (err) {
      const status = err.response?.status;
      if (status === 429 && attempt < retries - 1) {
        const delay = BACKOFF_BASE * Math.pow(2, attempt);
        console.warn(`⚠️ Rate limit (429). Retry em ${delay}ms`);
        await sleep(delay);
        attempt++;
        continue;
      }
      throw err;
    }
  }
}

// Busca marca pela API v3
async function fetchMarcaV3(produtoId, retries = 3) {
  const token = process.env.TINY_ACCESS_TOKEN;
  if (!token) {
    console.warn('⚠️ ACCESS_TOKEN v3 não definido. Passe por /auth → /callback primeiro.');
    return null;
  }
  try {
    const resp = await axios.get(
      `${TINY_API_V3_BASE}/produtos/${produtoId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = resp.data?.data;
    if (!data) {
      console.warn(`⚠️ Resposta sem data para ID ${produtoId}`);
      return null;
    }
    // Tenta extrair marca de forma genérica
    function findBrand(obj) {
      if (!obj || typeof obj !== 'object') return null;
      if (obj.marca) {
        const m = obj.marca;
        if (typeof m === 'object') return m.nome || m.descricao || null;
        if (typeof m === 'string') return m.trim();
      }
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (typeof val === 'object') {
          const found = findBrand(val);
          if (found) return found;
        }
      }
      return null;
    }
    const marca = findBrand(data);
    if (!marca) console.warn(`⚠️ Produto ${produtoId} não retornou campo marca na v3`);
    return marca;
  } catch (err) {
    const status = err.response?.status;
    if (status === 429 && retries > 0) {
      const delay = BACKOFF_BASE * (4 - retries);
      console.warn(`⚠️ Rate limit, retry em ${delay}ms (restam ${retries - 1})`);
      await new Promise(r => setTimeout(r, delay));
      return fetchMarcaV3(produtoId, retries - 1);
    }
    console.warn(`⚠️ Falha ao obter marca V3 para ID ${produtoId}: ${status}`);
    return null;
  }
}
      { $set: { nome, marca, atualizado_em: new Date().toISOString() } },
      { upsert: true }
    );
  } catch (err) {
    console.error(`❌ Erro ao salvar produto ${codigo}:`, err);
  }
}

// Handler principal
async function listarMarcas(req, res) {
  let pagina = 1;
  let totalProdutos = 0;
  let totalMarcasValidas = 0;
  const inicio = Date.now();
  const limit = pLimit(CONCURRENCY);
  const contagemMarcas = {};

  try {
    while (true) {
      const response = await axios.post(API_V2_LIST_URL, null, {
        params: { token: API_V2_TOKEN, formato: 'json', pagina },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      const produtos = response.data?.retorno?.produtos || [];
      if (!produtos.length) break;

      console.log(`[Página ${pagina}] Processando ${produtos.length} produtos...`);
      const marcasPagina = new Set();

      const tarefas = produtos.map(({ produto }) => limit(async () => {
        totalProdutos++;
        const codigo = produto.codigo;
        const nome = produto.nome?.trim();
        let marca = produto.marca?.trim();

        if (!marca && produto.id) {
          marca = await fetchMarcaV3(produto.id);
        }
        if (!marca) {
          console.log(`❌ Marca ausente para código: ${codigo}`);
          return;
        }
        marcasPagina.add(marca);
        contagemMarcas[marca] = (contagemMarcas[marca] || 0) + 1;
        await salvarOuAtualizarProduto({ codigo, nome, marca });
      }));

      await Promise.all(tarefas);
      console.log(`→ Marcas válidas nesta página: ${marcasPagina.size}`);
      totalMarcasValidas += marcasPagina.size;

      if (pagina % 5 === 0) {
        console.log(`📊 Top parciais após ${pagina} páginas:`);
        const top = Object.entries(contagemMarcas)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([m, c]) => `• ${m}: ${c}`)
          .join('\n') || '• (nenhuma marca identificada ainda)';
        console.log(top);
      }

      pagina++;
    }

    const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
    console.log(`✅ Concluído: ${pagina - 1} páginas processadas`);
    console.log(`🔢 Total de produtos analisados: ${totalProdutos}`);
    console.log(`🏷️ Marcas válidas salvas: ${totalMarcasValidas}`);
    console.log(`🕒 Tempo total: ${duracao}s`);

    console.log('📊 Top marcas identificadas:');
    Object.entries(contagemMarcas)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([m, c]) => console.log(`• ${m}: ${c}`));

    res.json({ sucesso: true, paginas: pagina - 1, produtos: totalProdutos, marcasSalvas: totalMarcasValidas, tempo: duracao + 's', topMarcas: contagemMarcas });
  } catch (error) {
    console.error('❌ Erro ao listar marcas:', error.response?.data || error.message);
    res.status(500).json({ erro: 'Erro ao listar marcas.' });
  }
}

module.exports = { listarMarcas };
