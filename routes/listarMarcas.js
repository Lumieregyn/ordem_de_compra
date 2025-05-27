// Estrutura atualizada — marca só da API produto.obter.php, sem fallback por nome, com contagem em tempo real por marca

const axios = require('axios');
const pLimit = require('p-limit');
const { MongoClient } = require('mongodb');

const mongoClient = new MongoClient(process.env.MONGO_URI);
let produtosCollection;

mongoClient.connect().then(() => {
  const db = mongoClient.db('ordens');
  produtosCollection = db.collection('produtos');
  console.log('✅ [listarMarcas.js] Conectado ao MongoDB');
});

async function salvarOuAtualizarProduto({ codigo, nome, marca }) {
  if (!codigo || !nome || !marca) return;
  await produtosCollection.updateOne(
    { codigo },
    {
      $set: {
        nome,
        marca,
        atualizado_em: new Date().toISOString()
      }
    },
    { upsert: true }
  );
}

async function obterMarcaPorCodigo(codigo, token) {
  try {
    const { data } = await axios.post(
      'https://api.tiny.com.br/api2/produto.obter.php',
      null,
      {
        params: {
          token,
          formato: 'json',
          codigo
        },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    return data?.retorno?.produto?.marca?.trim() || null;
  } catch (err) {
    console.warn(`⚠️ Falha ao obter marca para código: ${codigo}`);
    return null;
  }
}

async function listarMarcas(req, res) {
  const token = process.env.TINY_API_TOKEN;
  let pagina = 1;
  let totalProdutos = 0;
  let totalMarcasValidas = 0;
  const inicio = Date.now();
  const limit = pLimit(5);
  const contagemMarcas = {};

  try {
    while (true) {
      const response = await axios.post(
        'https://api.tiny.com.br/api2/produtos.pesquisa.php',
        null,
        {
          params: {
            token,
            formato: 'json',
            pagina
          },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
      );

      const produtos = response.data?.retorno?.produtos || [];
      if (!produtos.length) break;

      let marcasPagina = new Set();

      console.log(`[Página ${pagina}] Processando ${produtos.length} produtos...`);

      const tarefas = produtos.map(p => limit(async () => {
        totalProdutos++;
        const codigo = p.produto?.codigo;
        const nome = p.produto?.nome?.trim();

        let marca = p.produto?.marca?.trim();

        if (!marca && codigo) {
          marca = await obterMarcaPorCodigo(codigo, token);
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
      pagina++;
    }

    const fim = Date.now();
    const duracao = ((fim - inicio) / 1000).toFixed(1);

    console.log(`✅ Concluído: ${pagina - 1} páginas processadas`);
    console.log(`🔢 Total de produtos analisados: ${totalProdutos}`);
    console.log(`🏷️ Marcas válidas salvas: ${totalMarcasValidas}`);
    console.log(`🕒 Tempo total: ${duracao} segundos`);

    const topMarcas = Object.entries(contagemMarcas)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([marca, count]) => `• ${marca}: ${count}`)
      .join('\n');

    console.log('📊 Top marcas identificadas:');
    console.log(topMarcas);

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
