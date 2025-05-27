// index.js
require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const qs      = require('qs');

const { conectarMongo } = require('./services/mongoClient');
const ordemRoutes       = require('./routes/ordem');
const { setAccessToken, getAccessToken } = require('./services/tokenService'); // será criado

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

// Conecta com MongoDB Atlas
conectarMongo();

// ----- OAuth2 (OpenID Connect) para Tiny API v3 -----
const OIDC_SCOPES = 'openid';

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

    setAccessToken(resp.data.access_token); // <- uso do serviço
    console.log(`✅ Token obtido; expira em ${resp.data.expires_in}s`);
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

    setAccessToken(resp.data.access_token); // <- uso do serviço
    console.log(`🔄 Token renovado; expira em ${resp.data.expires_in}s`);
    res.send('Token renovado com sucesso');
  } catch (err) {
    console.error('❌ Erro ao renovar token:', err.response?.data || err.message);
    res.status(500).send('Erro ao renovar token');
  }
});

// ----- Teste: Inspeciona JSON bruto de produto via v3 -----
app.get('/test-marca/:id', async (req, res) => {
  const token = getAccessToken();
  if (!token) return res.status(401).send('Sem token v3. Chame /auth primeiro.');

  try {
    const resp = await axios.get(
      `https://erp.tiny.com.br/public-api/v3/produtos/${req.params.id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    res.json(resp.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ----- Rotas da OC (já modularizadas) -----
app.use('/', ordemRoutes);

// ----- Listar Marcas ainda inline (vamos modularizar depois) -----
const { listarMarcas } = require('./routes/listarMarcas');
app.get('/listar-marcas', listarMarcas);

// ----- Consulta produto no Mongo -----
const { getProdutosCollection } = require('./services/mongoClient');
app.get('/produto/:codigo', async (req, res) => {
  const { codigo } = req.params;
  if (!codigo) return res.status(400).json({ erro: 'Código é obrigatório' });

  try {
    const produto = await getProdutosCollection().findOne({ codigo });
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });
    res.json(produto);
  } catch (err) {
    console.error('❌ Erro ao buscar produto:', err);
    res.status(500).json({ erro: 'Erro interno ao buscar produto' });
  }
});

// ----- Health Check -----
app.get('/', (req, res) => res.send('API Tiny-Mongo OK'));

// ----- Start -----
app.listen(port, () => console.log(`🚀 Servidor rodando na porta ${port}`));
