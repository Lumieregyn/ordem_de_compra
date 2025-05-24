require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { gerarOrdemCompra } = require('./services/ocGenerator');
const { enviarOrdemCompraReal } = require('./services/enviaOrdem');

const app = express();
let accessToken = null;

// Rota /auth – Inicia o fluxo OAuth2
app.get('/auth', (req, res) => {
  const clientId = process.env.CLIENT_ID;
  const redirectUri = process.env.REDIRECT_URI;

  console.log('🔍 /auth route hit');
  console.log('📦 Env vars:', { clientId, redirectUri });

  if (!clientId || !redirectUri) {
    return res.status(500).send('❌ CLIENT_ID ou REDIRECT_URI ausentes.');
  }

  const authUrl =
    'https://api.tiny.com.br/oauth2/authorize?response_type=code&client_id=' +
    clientId +
    '&redirect_uri=' +
    encodeURIComponent(redirectUri);

  res.redirect(authUrl);
});

// Rota /callback – Troca o código por token
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  console.log('🔁 Callback com code:', code);

  if (!code) {
    return res.status(400).send('❌ Código ausente na URL.');
  }

  try {
    const response = await axios.post('https://api.tiny.com.br/oauth2/token', null, {
      params: {
        grant_type: 'authorization_code',
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        code: code,
        redirect_uri: process.env.REDIRECT_URI
      }
    });

    accessToken = response.data.access_token;
    console.log('✅ Token de acesso obtido:', accessToken);
    res.send('✅ Token de acesso obtido com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao obter token:', error.response?.data || error.message);
    res.status(500).send('Erro ao obter token de acesso');
  }
});

// Rota /gerar-oc – Simula geração da OC com token
app.get('/gerar-oc', (req, res) => {
  console.log('📦 Rota /gerar-oc acessada');
  if (!accessToken) {
    return res.status(401).send('❌ Token ausente. Acesse /auth primeiro.');
  }

  const oc = gerarOrdemCompra();
  oc.token = accessToken;
  res.json(oc);
});

// Rota /enviar-oc – Envia OC real para a API Tiny
app.get('/enviar-oc', async (req, res) => {
  if (!accessToken) {
    return res.status(401).send('❌ Token ausente. Acesse /auth primeiro.');
  }

  try {
    const resultado = await enviarOrdemCompraReal(accessToken);
    console.log('✅ Resposta Tiny:', resultado);
    res.json(resultado);
  } catch (error) {
    console.error('❌ Erro ao enviar OC:', error.response?.data || error.message);
    res.status(500).send('Erro ao enviar Ordem de Compra');
  }
});

// Escuta na porta correta (usada pelo Railway)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('🚀 Servidor rodando na porta ' + PORT);
});
