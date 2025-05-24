require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { gerarOrdemCompra } = require('./services/ocGenerator');
const { enviarOrdemCompra } = require('./services/enviarOrdem');

const app = express();
const port = process.env.PORT || 8080;

let accessToken = null; // Token global em memória

app.get('/auth', (req, res) => {
  console.log('🔍 /auth route hit');
  const clientId = process.env.CLIENT_ID;
  const redirectUri = process.env.REDIRECT_URI;

  const authUrl = `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=openid`;

  console.log('🔁 Redirecionando para:', authUrl);
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  console.log('🔄 /callback route hit');
  const code = req.query.code;

  if (!code) {
    return res.status(400).send('Erro: código de autorização ausente.');
  }

  try {
    const tokenResponse = await axios.post(
      'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.REDIRECT_URI,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    accessToken = tokenResponse.data.access_token;
    console.log('✅ Token obtido com sucesso');
    res.send('Autenticação concluída com sucesso! Agora você pode chamar /enviar-oc');
  } catch (err) {
    console.error('❌ Erro ao obter token:', err.response?.data || err.message);
    res.status(500).send('Erro ao obter token de acesso.');
  }
});

app.get('/enviar-oc', async (req, res) => {
  if (!accessToken) {
    return res.status(401).send('No access token. Call /auth first.');
  }

  try {
    const xml = gerarOrdemCompra();
    const resposta = await enviarOrdemCompra(accessToken, xml);
    res.send(resposta);
  } catch (err) {
    console.error('❌ Erro no envio da OC:', err.response?.data || err.message);
    res.status(500).send('Erro ao enviar ordem de compra.');
  }
});

app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
});
