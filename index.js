// index.js
// Arquivo principal do backend Lumiéregyn
// Inclui: OAuth2 (OpenID Connect) para Tiny API v3, debug de JSON v3, rota /listar-marcas e envio de OC

require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const qs      = require('qs');
const { MongoClient } = require('mongodb');
const { gerarOrdemCompra } = require('./services/ocGenerator');
const { enviarOrdemCompra } = require('./services/enviarOrdem');
const { listarMarcas }      = require('./routes/listarMarcas');

const app = express();
const port = process.env.PORT || 8080;
let accessToken = null;

// Conexão com MongoDB
const mongoClient = new MongoClient(process.env.MONGO_URI, {
  useNewUrlParser: true, useUnifiedTopology: true
});
let produtosCollection;

mongoClient.connect()
  .then(() => {
    produtosCollection = mongoClient.db('ordens').collection('produtos');
    console.log('✅ Conectado ao MongoDB');
  })
  .catch(err => console.error('❌ Erro MongoDB:', err));

app.use(express.json());

// ----- OAuth2 (OpenID Connect) para Tiny API v3 -----
// Ajuste aqui para incluir leitura de produtos e marcas
const OIDC_SCOPES = 'openid produtos:read marcas:read';

app.get('/auth', (req, res) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:    process.env.CLIENT_ID,
    redirect_uri: process.env.REDIRECT_URI,
    scope:        OIDC_SCOPES
  });
  res.redirect(
    `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth?${params}`
  );
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Código de autorização ausente');
  try {
    const resp = await axios.post(
      'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
      qs.stringify({
        grant_type:    'authorization_code',
        code,
        client_id:     process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        redirect_uri:  process.env.REDIRECT_URI
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    accessToken = resp.data.access_token;
    process.env.TINY_ACCESS_TOKEN = accessToken;
    console.log(`✅ Token obtido; expira em ${resp.data.expires_in}s`);
    res.send('Autenticação concluída com sucesso!');
  } catch (err) {
    console.error('❌ Erro ao obter token:', err.response?.data || err.message);
    res.status(500).send('Erro ao obter token');
  }
});

// (Opcional) refresh do token
app.get('/refresh', async (req, res) => {
  const refreshToken = process.env.REFRESH_TOKEN;
  if (!refreshToken) return res.status(400).send('Refresh token ausente');
  try {
    const resp = await axios.post(
      'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
      qs.stringify({
        grant_type:    'refresh_token',
        refresh_token: refreshToken,
        client_id:     process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    accessToken = resp.data.access_token;
    process.env.TINY_ACCESS_TOKEN = accessToken;
    console.log(`🔄 Token renovado; expira em ${resp.data.expires_in}s`);
    res.send('Token renovado com sucesso');
  } catch (err) {
    console.error('❌ Erro ao renovar token:', err.response?.data || err.message);
    res.status(500).send('Erro ao renovar token');
  }
});

// ----- Debug endpoint para inspecionar JSON cru da API v3 -----
app.get('/test-marca/:id', async (req, res) => {
  const { id } = req.params;
  if (!accessToken) return res.status(401).send('Sem token v3. Chame /auth primeiro.');
  try {
    const resp = await axios.get(
      `https://erp.tiny.com.br/public-api/v3/produtos/${id}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return res.json(resp.data);
  } catch (err) {
    return res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ----- Envio de Ordem de Compra -----
app.post('/enviar-oc', async (req, res) => {
  if (!accessToken) return res.status(401).send('Sem token. Chame /auth primeiro.');
  const dados = req.body || {};
  const xml   = gerarOrdemCompra(dados);
  const result = await enviarOrdemCompra(accessToken, xml);
  if (!result.success) return res.status(500).json({ erro: result.error });
  res.json(result.data);
});

// ----- Listar Marcas via API v3 -----
app.get('/listar-marcas', listarMarcas);

// ----- Consulta produto por código -----
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

// ----- Health Check -----
app.get('/', (req, res) => res.send('API Tiny-Mongo OK'));

app.listen(port, () => console.log(`🚀 Servidor rodando na porta ${port}`));
