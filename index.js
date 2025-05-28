require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { authCallback, getAccessToken } = require('./serviços/tokenService');
const { processarProdutosTiny } = require('./serviços/tinyService');
const { inferirMarcaViaIA } = require('./serviços/openaiMarcaService');
const { getProdutoFromTinyV3 } = require('./serviços/tinyProductService');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('🚀 API Tiny Sync ativa.');
});

// 🔐 OAuth2 - Redireciona para consentimento da Tiny
app.get('/auth', (req, res) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.CLIENT_ID,
    redirect_uri: process.env.REDIRECT_URI,
    scope: 'openid'
  });

  const url = `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth?${params}`;
  res.redirect(url);
});

// 🔁 Callback do Tiny para salvar o token
app.get('/auth/callback', async (req, res) => {
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

// 🔍 Retorna o token atual (para debug)
app.get('/token', (req, res) => {
  const token = getAccessToken();
  if (!token) return res.status(404).send('Token não encontrado');
  res.send({ token });
});

// 🔄 Roda a sincronização completa dos produtos
app.get('/sync-produtos', async (req, res) => {
  try {
    const resultado = await processarProdutosTiny();
    res.json(resultado);
  } catch (err) {
    console.error('Erro ao sincronizar produtos:', err);
    res.status(500).send('Erro na sincronização');
  }
});

// 🧠 Testa a IA de marca para um produto da v3 da Tiny
app.get('/testar-marca-ia/:id', async (req, res) => {
  const produtoId = req.params.id;
  try {
    const produto = await getProdutoFromTinyV3(produtoId);
    const marcaInferida = await inferirMarcaViaIA(produto);
    res.json({ id: produtoId, sku: produto?.sku, marcaInferida });
  } catch (err) {
    console.error('Erro ao testar IA de marca:', err);
    res.status(500).send('Erro na inferência de marca');
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`);
});
