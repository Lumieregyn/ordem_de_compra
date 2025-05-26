require('dotenv').config();
const express = require('express');
const axios = require('axios');
const qs = require('qs');
const pLimit = require('p-limit');
const { gerarOrdemCompra } = require('./services/ocGenerator');
const { enviarOrdemCompra } = require('./services/enviarOrdem');
const { inserirMarca, marcaExiste } = require('./services/pinecone');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
let accessToken = null;

// 🔐 Rota de autenticação OAuth2
app.get('/auth', (req, res) => {
  const clientId = process.env.CLIENT_ID;
  const redirectUri = process.env.REDIRECT_URI;
  const authUrl = `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth` +
    `?response_type=code&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}&scope=openid`;

  console.log('➡️ Redirecionando para:', authUrl);
  res.redirect(authUrl);
});

// 🔄 Callback da autenticação
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('Erro: código de autorização ausente.');

  try {
    const response = await axios.post(
      'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
      qs.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        redirect_uri: process.env.REDIRECT_URI
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    accessToken = response.data.access_token;
    console.log('✅ Access token recebido e armazenado.');
    res.send('Autenticação concluída com sucesso! Pronto para usar /enviar-oc');
  } catch (error) {
    console.error('❌ Erro ao obter access token:', error.response?.data || error.message);
    res.send('Erro ao obter token.');
  }
});

// 📦 Envia Ordem de Compra
app.post('/enviar-oc', async (req, res) => {
  try {
    const xml = gerarOrdemCompra(req.body);
    const resultado = await enviarOrdemCompra(xml);
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ erro: 'Falha ao enviar OC', detalhes: err.message });
  }
});

// 🧠 Listar e indexar marcas no Pinecone
app.get('/listar-marcas', async (req, res) => {
  const marcasEncontradas = new Set();
  let pagina = 1, total = 0, totalProdutos = 0;
  const inicio = Date.now();
  const limit = pLimit(5);

  try {
    while (true) {
      const { data } = await axios.get('https://api.tiny.com.br/api2/produtos.pesquisa.php', {
        params: { token: process.env.TINY_API_TOKEN, pagina },
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
});

// 🚀 Inicializa servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor iniciado na porta ${PORT}`);
});
