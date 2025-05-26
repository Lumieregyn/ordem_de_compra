const axios = require('axios');
const pLimit = require('p-limit');
const { inserirMarca, marcaExiste } = require('../services/pinecone');

async function listarMarcas(req, res) {
  const marcasEncontradas = new Set();
  let pagina = 1, total = 0, totalProdutos = 0;
  const inicio = Date.now();
  const limit = pLimit(5);

  try {
    while (true) {
      const { data } = await axios.get('https://api.tiny.com.br/api2/produtos.pesquisa.php', {
        params: {
          token: process.env.TINY_API_TOKEN,
          pagina
        }
      });

      const produtos = data.retorno.produtos || [];
      if (!produtos.length) break;

      console.log(`[Página ${pagina}] Processando ${produtos.length} produtos...`);

      const tarefas = produtos.map(p => limit(async () => {
        totalProdutos++;
        const marca = p.produto.marca?.trim();
        if (marca && !marcasEncontradas.has(marca)) {
          const existe = await marcaExiste(marca);
          if (!existe) {
            await inserirMarca(marca);
            marcasEncontradas.add(marca);
            total++;
          }
        }
      }));

      await Promise.all(tarefas);
      pagina++;
    }

    const fim = Date.now();
    const duracao = ((fim - inicio) / 1000).toFixed(1);

    console.log(`✅ Concluído: ${pagina - 1} páginas processadas`);
    console.log(`🔢 Total de produtos analisados: ${totalProdutos}`);
    console.log(`🏷️ Novas marcas indexadas: ${total}`);
    console.log(`🕒 Tempo total: ${duracao} segundos`);

    res.json({
      sucesso: true,
      paginas: pagina - 1,
      produtos: totalProdutos,
      marcasNovas: total,
      tempo: duracao + 's'
    });

  } catch (error) {
    console.error('❌ Erro ao listar marcas:', error.response?.data || error.message);
    res.status(500).json({ erro: 'Erro ao listar marcas.' });
  }
}

module.exports = { listarMarcas };
