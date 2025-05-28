require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { authCallback, getAccessToken } = require('./services/tokenService');
const { processarProdutosTiny } = require('./services/tinyService'); // ajuste aqui conforme o nome do arquivo real
const { inferirMarcaViaIA } = require('./services/openaiMarcaService');
const { getProdutoFromTinyV3 } = require('./services/tinyProductService');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// 🌐 Healthcheck
app.get('/', (req, res) => {
  res.send('🚀 API Tiny Sync ativa.');
});

// 🔐 Início do fluxo OAuth2
app.get('/auth', (req, res) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.CLIENT_ID,
    redirect_uri: process.env.REDIRECT_URI,
    scope: 'openid',
  });

  res.redirect(`https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth?${params}`);
});

// 🔐 Callback para salvar token Tiny v3
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Código ausente');

  try {
    await authCallback(code);
    res.send('✅ Token salvo com sucesso.');
  } catch (err) {
    console.error('❌ Erro no callback:', err);
    res.status(500).send('Erro ao salvar token');
  }
});

// 🔐 Verificar token salvo
app.get('/token', (req, res) => {
  const token = getAccessToken();
  if (!token) return res.status(404).send('Token não encontrado');
  res.json({ token });
});

// 🔄 Sincronizar produtos da Tiny com o Mongo
app.get('/sync-produtos', async (req, res) => {
  try {
    const resultado = await processarProdutosTiny();
    res.json(resultado);
  } catch (err) {
    console.error('❌ Erro ao sincronizar produtos:', err);
    res.status(500).send('Erro na sincronização');
  }
});

// 🤖 Testar inferência de marca via IA
app.get('/testar-marca-ia/:id', async (req, res) => {
  const produtoId = req.params.id;
  try {
    const produto = await getProdutoFromTinyV3(produtoId);
    const marcaInferida = await inferirMarcaViaIA(produto);
    res.json({ id: produtoId, sku: produto?.sku, marcaInferida });
  } catch (err) {
    console.error('❌ Erro ao testar IA de marca:', err);
    res.status(500).send('Erro na inferência de marca');
  }
});

app.listen(PORT, () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`);
});
