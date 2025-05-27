// routes/listarMarcas.js
// Handler de listagem de marcas via Tiny API v3 com retry/backoff e controle de concorrência

const axios = require('axios');
const pLimit = require('p-limit');
const { MongoClient } = require('mongodb');

// Configurações
const TINY_API_V3_BASE  = 'https://erp.tiny.com.br/public-api/v3';
const API_V2_LIST_URL   = 'https://api.tiny.com.br/api2/produtos.pesquisa.php';
const API_V2_TOKEN      = process.env.TINY_API_TOKEN;
const CONCURRENCY       = 2;
const MAX_RETRIES       = 3;
const BACKOFF_BASE      = 500; // ms para backoff

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

// utilitário de sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Upsert de produto no MongoDB
async function salvarOuAtualizarProduto({ codigo, nome, marca }) {
  if (!codigo || !nome || !marca) return;
  try {
    await produtosCollection.updateOne(
      { codigo },
      { $set: { nome, marca, atualizado_em: new Date().toISOString() } },
      { upsert: true }
    );
  } catch (err) {
    console.error(`❌ Erro ao salvar produto ${codigo}:`, err);
  }
}

// Busca marca pela API v3, extrai de resp.data.marca.nome
async function fetchMarcaV3(produtoId, retries = MAX_RETRIES) {
  const token = process.env.TINY_ACCESS_TOKEN;
  if (!token) {
    console.warn('⚠️ TOKEN v3 ausente. Rode /auth → /callback primeiro.');
    return null;
  }
  try {
    const resp = await axios.get(
      `${TINY_API_V3_BASE}/produtos/${produtoId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    // resp.data já é o objeto do produto conforme o teste
    const produto = resp.data;
    const marcaNome = produto.marca?.nome;
    if (!marcaNome) {
      console.warn(`⚠️ Produto ${produtoId} não trouxe marca no campo marca.nome`);
      return null;
    }
    return marcaNome.trim();
  } catch (err) {
    const status = err.response?.status;
    if (status === 429 && retries > 0) {
      const delay = BACKOFF_BASE * Math.pow(2, MAX_RETRIES - retries);
      console.warn(`⚠️ Rate limit (429), retry em ${delay}ms (restam ${retries - 1})`);
      await sleep(delay);
      return fetchMarcaV3(produtoId, retries - 1);
    }
    console.warn(`⚠️ Erro ao buscar marca v3 para ID ${produtoId}: ${status}`);
    return null;
  }
}

// Handler principal: paginação pela API v2 e fallback para v3
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
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const produtos = response.data?.retorno?.produtos || [];
      if (!produtos.length) break;

      console.log(`[Página ${pagina}] Processando ${produtos.length} produtos...`);
      const marcasPagina = new Set();

      const tarefas = produtos.map(({ produto }) =>
        limit(async () => {
          totalProdutos++;
          const codigo = produto.codigo;
          const nome   = produto.nome?.trim();
          let marca    = produto.marca?.trim();

          // Se não veio marca na v2, busca na v3 usando ID
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
        })
      );

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

    res.json({
      sucesso: true,
      paginas: pagina - 1,
      produtos: totalProdutos,
      marcasSalvas: totalMarcasValidas,
      tempo: duracao + 's',
      topMarcas: contagemMarcas
    });
  } catch (error) {
    console.error('❌ Erro ao listar marcas:', error.response?.data || error.message);
    res.status(500).json({ erro: 'Erro ao listar marcas.' });
  }
}

module.exports = { listarMarcas };
