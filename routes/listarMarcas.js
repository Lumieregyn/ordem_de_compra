// listarMarcas.js
// Versão atualizada para usar API v3 da Tiny e extrair marca via Bearer token

const axios = require('axios');
const pLimit = require('p-limit');
const { MongoClient } = require('mongodb');

// Constants para Tiny API v3
const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';
const ACCESS_TOKEN = process.env.TINY_ACCESS_TOKEN;  // gerado via OpenID Connect

// Conexão com MongoDB
const mongoClient = new MongoClient(process.env.MONGO_URI);
let produtosCollection;

mongoClient.connect().then(() => {
  const db = mongoClient.db('ordens');
  produtosCollection = db.collection('produtos');
  console.log('✅ [listarMarcas.js] Conectado ao MongoDB');
});

// Função para salvar ou atualizar documento no MongoDB
async function salvarOuAtualizarProduto({ codigo, nome, marca }) {
  if (!codigo || !nome || !marca) return;
  await produtosCollection.updateOne(
    { codigo },
    {
      $set: {
        nome,
        marca,
        atualizado_em: new Date().toISOString(),
      },
    },
    { upsert: true }
  );
}

// Função que busca a marca diretamente na API v3
async function fetchMarcaV3(produtoId) {
  try {
    const resp = await axios.get(
      `${TINY_API_V3_BASE}/produtos/${produtoId}`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    // Estrutura esperada: { data: { data: { marca: { nome: "..." }, ... } } }
    const nomeMarca = resp.data?.data?.marca?.nome;
    return nomeMarca?.trim() || null;
  } catch (err) {
    const status = err.response?.status;
    console.warn(`⚠️ Falha ao obter marca V3 para ID ${produtoId}: ${status}`);
    return null;
  }
}

async function listarMarcas(req, res) {
  const tokenV2 = process.env.TINY_API_TOKEN; // ainda usado para pesquisa v2
  let pagina = 1;
  let totalProdutos = 0;
  let totalMarcasValidas = 0;
  const inicio = Date.now();
  const limit = pLimit(5);
  const contagemMarcas = {};

  try {
    while (true) {
      // Listagem de produtos (API v2)
      const response = await axios.post(
        'https://api.tiny.com.br/api2/produtos.pesquisa.php',
        null,
        {
          params: {
            token: tokenV2,
            formato: 'json',
            pagina,
          },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );

      const produtos = response.data?.retorno?.produtos || [];
      if (!produtos.length) break;

      const marcasPagina = new Set();
      console.log(`[Página ${pagina}] Processando ${produtos.length} produtos...`);

      // Processamento concorrente com limite
      const tarefas = produtos.map((p) =>
        limit(async () => {
          totalProdutos++;
          const item = p.produto || {};
          const codigo = item.codigo;
          const nome = item.nome?.trim();

          // Tenta marca já vinda na listagem v2
          let marca = item.marca?.trim();

          // Se não vier, busca via API v3 usando o ID retornado pela v2
          if (!marca && item.id) {
            marca = await fetchMarcaV3(item.id);
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

      // Relatório parcial a cada 5 páginas
      if (pagina % 5 === 0) {
        console.log(`📊 Top parciais após ${pagina} páginas:`);
        const top = Object.entries(contagemMarcas)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([m, c]) => `• ${m}: ${c}`)
          .join('\n');
        console.log(top || '• (nenhuma marca identificada ainda)');
      }

      pagina++;
    }

    const fim = Date.now();
    const duracao = ((fim - inicio) / 1000).toFixed(1);

    console.log(`✅ Concluído: ${pagina - 1} páginas processadas`);
    console.log(`🔢 Total de produtos analisados: ${totalProdutos}`);
    console.log(`🏷️ Marcas válidas salvas: ${totalMarcasValidas}`);
    console.log(`🕒 Tempo total: ${duracao}s`);

    const topMarcas = Object.entries(contagemMarcas)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([m, c]) => `• ${m}: ${c}`)
      .join('\n');

    console.log('📊 Top marcas identificadas:');
    console.log(topMarcas);

    res.json({
      sucesso: true,
      paginas: pagina - 1,
      produtos: totalProdutos,
      marcasSalvas: totalMarcasValidas,
      tempo: duracao + 's',
      topMarcas: contagemMarcas,
    });
  } catch (error) {
    console.error('❌ Erro ao listar marcas:', error.response?.data || error.message);
    res.status(500).json({ erro: 'Erro ao listar marcas.' });
  }
}

module.exports = { listarMarcas };
