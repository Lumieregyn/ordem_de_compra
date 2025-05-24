// index.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const ocGenerator = require('./services/ocGenerator');

const app = express();
const port = process.env.PORT || 8080;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;

app.get('/', (req, res) => {
  res.send('Ordem de Compra Inteligente – Backend Etapa 2');
});

app.get('/auth', (req, res) => {
  console.log('🔍 /auth route hit');

  if (!clientId || !redirectUri) {
    return res
      .status(500)
      .send('❌ CLIENT_ID ou REDIRECT_URI não configurados');
  }

  const authUrl =
    'https://api.tiny.com.br/oauth2/authorize' +
    '?response_type=code' +
    `&client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  console.log('🔍 /callback route hit');
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('❌ Authorization code não fornecido');
  }

  try {
    const tokenResponse = await axios.post(
      'https://api.tiny.com.br/oauth2/token',
      {
        grant_type: 'authorization_code',
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri
      }
    );

    const accessToken = tokenResponse.data.access_token;
    // aqui você pode salvar o accessToken em memória, banco etc.
    return res.send(`Código recebido do Tiny: ${code}`);
  } catch (err) {
    console.error('Erro ao obter token do Tiny:', err.response || err);
    return res.status(500).send('❌ Erro ao obter token do Tiny');
  }
});

app.get('/enviar-oc', async (req, res) => {
  console.log('🔍 /enviar-oc route hit');
  try {
    // Exemplo de payload de pedido já aprovado
    const pedido = require('./pedido_aprovado.json');
    const oc = ocGenerator.generateOC(pedido);
    return res.json(oc);
  } catch (err) {
    console.error('Erro ao gerar ordem de compra:', err);
    return res.status(500).send('❌ Erro ao gerar Ordem de Compra');
  }
});

app.use((req, res) => {
  res.status(404).send(`Não é possível obter ${req.path}`);
});

app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
});
