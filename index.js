// Estrutura consolidada do repositório analisado e atualizada com logs detalhados e paralelismo:

// index.js
require('dotenv').config();
const express = require('express');
const app = express();
const routes = require('./routes');

app.use(express.json());
app.use('/', routes);

app.listen(3000, () => console.log('Servidor iniciado na porta 3000'));


// routes.js
const express = require('express');
const router = express.Router();
const { authTiny, callbackTiny } = require('./services/tinyAuth');
const { gerarOrdemCompra } = require('./services/ocGenerator');
const { enviarOrdemCompra } = require('./services/enviarOrdem');
const { listarMarcas } = require('./services/pinecone');

router.get('/auth', authTiny);
router.get('/callback', callbackTiny);
router.post('/enviar-oc', async (req, res) => {
  try {
    const xml = gerarOrdemCompra(req.body);
    const resultado = await enviarOrdemCompra(xml);
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ erro: 'Falha ao enviar OC', detalhes: err.message });
  }
});
router.get('/listar-marcas', listarMarcas);

module.exports = router;


// services/ocGenerator.js
const xml2js = require('xml2js');
const crypto = require('crypto');

function gerarOrdemCompra(dados) {
  const builder = new xml2js.Builder({ headless: true });
  const objetoXml = {
    pedido: {
      data_pedido: new Date().toISOString().split('T')[0],
      cliente: {
        nome: dados.nome || 'Cliente Padrão',
        codigo: dados.codigo || '1',
      },
      itens: {
        item: dados.itens.map((i, index) => ({
          codigo: i.codigo,
          descricao: i.descricao,
          quantidade: i.quantidade,
          valor_unitario: i.valor_unitario
        }))
      }
    }
  };
  return builder.buildObject(objetoXml);
}

module.exports = { gerarOrdemCompra };


// services/enviarOrdem.js
const axios = require('axios');
const qs = require('qs');
require('dotenv').config();

async function enviarOrdemCompra(xml) {
  const params = qs.stringify({ token: process.env.TINY_API_TOKEN, xml });
  const url = `https://api.tiny.com.br/api2/pedido.incluir.php?${params}`;
  try {
    const { data } = await axios.get(url);
    return data.retorno;
  } catch (err) {
    return { erro: true, mensagem: err.message };
  }
}

module.exports = { enviarOrdemCompra };


// services/pinecone.js
const axios = require('axios');
const crypto = require('crypto');
const pLimit = require('p-limit');

async function inserirMarca(marca) {
  const id = crypto.createHash('md5').update(marca).digest('hex');
  const vetor = new Array(1536).fill(0);

  await axios.post('https://lumiere-logs-ada-gqv3rnm.svc.aped-4627-b74a.pinecone.io/vectors/upsert', {
    namespace: 'marcas',
    vectors: [{ id, values: vetor, metadata: { marca } }]
  }, {
    headers: { 'Api-Key': process.env.PINECONE_API_KEY }
  });
}

async function marcaExiste(marca) {
  const id = crypto.createHash('md5').update(marca).digest('hex');
  const res = await axios.post('https://lumiere-logs-ada-gqv3rnm.svc.aped-4627-b74a.pinecone.io/vectors/fetch', {
    ids: [id], namespace: 'marcas'
  }, {
    headers: { 'Api-Key': process.env.PINECONE_API_KEY }
  });

  return res.data.vectors && res.data.vectors[id];
}

async function listarMarcas(req, res) {
  const marcasEncontradas = new Set();
  let pagina = 1, total = 0, totalProdutos = 0;
  const inicio = Date.now();
  const limit = pLimit(5);

  while (true) {
    const { data } = await axios.get('https://api.tiny.com.br/api2/produtos.pesquisa.php', {
      params: { token: process.env.TINY_API_TOKEN, pagina },
    });

    const produtos = data.retorno.produtos || [];
    if (!produtos.length) break;

    console.log(`[Página ${pagina}] Processando ${produtos.length} produtos...`);

    const tarefas = produtos.map(p => limit(async () => {
      totalProdutos++;
      const marca = p.produto.marca;
      if (marca && !marcasEncontradas.has(marca)) {
        const existe = await marcaExiste(marca);
        if (!existe) await inserirMarca(marca);
        marcasEncontradas.add(marca);
        total++;
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
}

module.exports = { listarMarcas };
