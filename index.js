// index.js
// Arquivo principal do backend Lumiéregyn
// Inclui: OAuth2 (OpenID Connect) para Tiny API v3, rota /listar-marcas usando API v3, e endpoints de produto e OC

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const qs = require('qs');
const pLimit = require('p-limit');
const { MongoClient } = require('mongodb');
const { gerarOrdemCompra } = require('./services/ocGenerator');
const { enviarOrdemCompra } = require('./services/enviarOrdem');
// Import do handler listarMarcas deve apontar para pasta 'routes'
const { listarMarcas } = require('./routes/listarMarcas');

// Configurações do OAuth2 (OpenID Connect) Tiny API v3
const tokenSettings = {
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI,
  scopes: 'openid produtos:read marcas:read produtos:write',
};

const app = express();
const port = process.env.PORT || 8080;
let accessToken = null;

// Conexão com MongoDB Atlas
const mongoClient = new MongoClient(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
let produtosCollection;

mongoClient.connect()
  .then(() => {
    const db = mongoClient.db('ordens');
    produtosCollection = db.collection('produtos');
    console.log('✅ Conectado ao MongoDB');
  })
  .catch(err => console.error('❌ Erro MongoDB:', err));

// Função helper para upsert de produtos
async function salvarOuAtualizarProduto({ codigo, nome, marca }) {
  if (!codigo || !nome || !marca) return;
  try {
    await produtosCollection.updateOne(
      { codigo },
      { $set: { nome, marca, atualizado_em: new Date() } },
      { upsert: true }
    );
  } catch (err) {
    console.error(`❌ Erro ao salvar produto ${codigo}:`, err);
  }
}

app.use(express.json());

// --------- Rotas OAuth2 Tiny API v3 ---------
app.get('/auth', (req, res) => {
  const { clientId, redirectUri, scopes } = tokenSettings;
  const authUrl =
    `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scopes)}`;
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Código de autorização ausente');
  try {
    const response = await axios.post(
      'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
      qs.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: tokenSettings.clientId,
        client_secret: tokenSettings.clientSecret,
        redirect_uri: tokenSettings.redirectUri,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    accessToken = response.data.access_token;
    process.env.TINY_ACCESS_TOKEN = accessToken;
    console.log(`✅ Token obtido; expira em ${response.data.expires_in}s`);
    res.send('Autenticação concluída com sucesso!');
  } catch (err) {
    console.error('❌ Erro ao obter token:', err.response?.data || err.message);
    res.status(500).send('Erro ao obter token');
  }
});

app.get('/refresh', async (req, res) => {
  const refreshToken = process.env.REFRESH_TOKEN;
  if (!refreshToken) return res.status(400).send('Refresh token ausente');
  try {
    const response = await axios.post(
      'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
      qs.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: tokenSettings.clientId,
        client_secret: tokenSettings.clientSecret,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    accessToken = response.data.access_token;
    process.env.TINY_ACCESS_TOKEN = accessToken;
    console.log(`🔄 Token renovado; expira em ${response.data.expires_in}s`);
    res.send('Token renovado com sucesso');
  } catch (err) {
    console.error('❌ Erro ao renovar token:', err.response?.data || err.message);
    res.status(500).send('Erro ao renovar token');
  }
});

// --------- Integração de Ordem de Compra ---------
app.get('/enviar-oc', async (req, res) => {
  if (!accessToken) return res.status(401).send('Sem token. Chame /auth primeiro.');
  try {
    const xml = gerarOrdemCompra();
    await enviarOrdemCompra(accessToken, xml);
    res.send('Ordem de compra enviada com sucesso!');
  } catch (err) {
    console.error('❌ Erro ao enviar OC:', err.response?.data || err.message);
    res.status(500).send('Erro ao enviar OC');
  }
});

// --------- Listar Marcas via API v3 ---------
app.get('/listar-marcas', listarMarcas);

// --------- Consulta produto por código ---------
app.get('/produto/:codigo', async (req, res) => {
  const { codigo } = req.params;
  if (!codigo) return res.status(400).json({ erro: 'Código é obrigatório' });
  try {
    const produto = await produtosCollection.findOne({ codigo });
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });
    res.json(produto);
  } catch (err) {
    console.error('❌ Erro ao buscar produto:', err);
    res.status(500).json({ erro: 'Erro interno ao buscar produto' });
  }
});

// --------- Health Check ---------
app.get('/', (req, res) => res.send('API Tiny-Mongo OK'));

// Inicia servidor
app.listen(port, () => console.log(`🚀 Servidor rodando na porta ${port}`));
