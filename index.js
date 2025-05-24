// index.js

// 1) Carrega variáveis de ambiente de um .env
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const path = require('path');
const ocGenerator = require('./services/ocGenerator');

const app = express();
const port = process.env.PORT || 8080;

// As credenciais devem vir como SERVICE VARIABLES no Railway:
// CLIENT_ID, CLIENT_SECRET e REDIRECT_URI
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;

// Rota de login no Tiny (inicia o OAuth2)
app.get('/auth', (req, res) => {
  console.log('🔍 /auth route hit');

  const authUrl = `https://api.tiny.com.br/oauth2/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  // redireciona o usuário para o Tiny
  res.redirect(authUrl);
});

// Callback do Tiny após login/autorização
app.get('/callback', async (req, res) => {
  console.log('🔍 /callback route hit');
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Parâmetro "code" ausente.');
  }

  try {
    // troca código por token de acesso
    const tokenResponse = await axios.post(
      'https://api.tiny.com.br/oauth2/token',
      null,
      {
        params: {
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
        },
      }
    );

    const accessToken = tokenResponse.data.access_token;
    console.log('✅ Access Token recebido:', accessToken);

    // TODO: armazene accessToken em algum lugar seguro (DB, Redis, etc.)
    // por simplicidade aqui retornamos apenas o código
    res.send(`Código recebido do Tiny: ${code}`);
  } catch (err) {
    console.error('❌ Erro ao trocar código por token:', err.response?.data || err.message);
    res.status(500).send('Erro interno ao obter token do Tiny.');
  }
});

// Gera a Ordem de Compra e envia para o Tiny
app.get('/enviar-oc', async (req, res) => {
  console.log('🔍 /enviar-oc route hit');

  try {
    // Carrega o JSON de pedido aprovado (exemplo em root: pedido_aprovado.json)
    const pedido = require(path.join(__dirname, 'pedido_aprovado.json'));

    // Gera o XML ou JSON da OC conforme Tiny espera
    const oc = ocGenerator.generateOrder(pedido);

    // Envia para a API do Tiny (exemplo de endpoint fictício)
    // Substitua pelos parâmetros corretos da API que estiver usando
    const tinyResponse = await axios.post(
      'https://api.tiny.com.br/api2/produto.incluir',
      null,
      {
        params: {
          token: process.env.ACCESS_TOKEN, // você deve obter e armazenar esse token no /callback
          xml: oc,
          json: true,
        },
      }
    );

    console.log('✅ Tiny respondeu:', tinyResponse.data);
    return res.json({ sucesso: true, tiny: tinyResponse.data });
  } catch (err) {
    console.error('❌ Erro ao enviar OC:', err.response?.data || err.message);
    return res.status(500).send('Erro ao enviar Ordem de Compra.');
  }
});

// Qualquer outra rota cai aqui
app.use((req, res) => {
  res.status(404).send(`Não é possível obter ${req.path}`);
});

// Inicia o servidor
app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
});
