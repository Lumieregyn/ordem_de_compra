require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { enviarOrdemCompra } = require('./services/enviarOrdem');
const listarMarcasRoute = require('./routes/listarMarcas');

const app = express();
const port = process.env.PORT || 8080;

let accessToken = '';

// Rota de autenticação OAuth2
app.get('/auth', (req, res) => {
  const clientId = process.env.CLIENT_ID;
  const redirectUri = process.env.REDIRECT_URI;

  const authUrl = `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=openid`;
  res.redirect(authUrl);
});

// Callback após autorização
app.get('/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send('Código de autorização ausente.');
  }

  try {
    const tokenResponse = await axios.post(
      'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        redirect_uri: process.env.REDIRECT_URI,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    accessToken = tokenResponse.data.access_token;
    console.log('✅ Token de acesso armazenado.');
    res.send('✅ Autenticação realizada com sucesso. Pode usar o /enviar-oc ou /listar-marcas.');
  } catch (error) {
    console.error('Erro ao obter access token:', error.response?.data || error.message);
    res.status(500).send('Erro ao obter token.');
  }
});

// Envio da ordem de compra
app.get('/enviar-oc', async (req, res) => {
  if (!accessToken) {
    return res.status(401).send('Token ausente. Faça /auth primeiro.');
  }

  const resultado = await enviarOrdemCompra(accessToken);

  if (resultado.success) {
    res.send('✅ Ordem de compra enviada com sucesso!');
  } else {
    res.status(500).send('Erro ao enviar OC: ' + resultado.error);
  }
});

// Consulta de marcas dos produtos na Tiny
app.use('/', (req, res, next) => {
  req.accessToken = accessToken;
  next();
}, listarMarcasRoute);

app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
});
