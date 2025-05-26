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

async function listarMarcas(req, res) {
  const token = process.env.TINY_API_TOKEN;
  let pagina = 1;
  let totalProdutos = 0;
  let totalMarcasUnicas = 0;
  const inicio = Date.now();
  const limit = pLimit(5);

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

      const marcasPagina = new Set();

      console.log(`[Página ${pagina}] Processando ${produtos.length} produtos...`);

      const tarefas = produtos.map(p => limit(async () => {
        totalProdutos++;
        const codigo = p.produto?.codigo;
        const nome = p.produto?.nome?.trim();
        let marca = p.produto?.marca?.trim();

        // Fallback: extrair marca do nome
        if (!marca && nome) {
          const match = nome.match(/^([^-–]+)/);
          if (match && match[1]) {
            marca = match[1].trim();
          }
        }

        if (codigo && nome && marca) {
          marcasPagina.add(marca);
          await salvarOuAtualizarProduto({ codigo, nome, marca });
        }
      }));

      await Promise.all(tarefas);

      console.log(`→ Marcas únicas nesta página: ${marcasPagina.size}`);
      totalMarcasUnicas += marcasPagina.size;
      pagina++;
    }

    const fim = Date.now();
    const duracao = ((fim - inicio) / 1000).toFixed(1);

    console.log(`✅ Concluído: ${pagina - 1} páginas processadas`);
    console.log(`🔢 Total de produtos analisados: ${totalProdutos}`);
    console.log(`🏷️ Marcas únicas identificadas: ${totalMarcasUnicas}`);
    console.log(`🕒 Tempo total: ${duracao} segundos`);

    res.json({
      sucesso: true,
      paginas: pagina - 1,
      produtos: totalProdutos,
      marcasUnicas: totalMarcasUnicas,
      tempo: duracao + 's'
    });

  } catch (error) {
    console.error('❌ Erro ao listar marcas:', error.response?.data || error.message);
    res.status(500).json({ erro: 'Erro ao listar marcas.' });
  }
}

module.exports = { listarMarcas };
