require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { enviarOrdemCompraReal } = require('./services/enviarOrdem');

const app = express();
const port = process.env.PORT || 8080;

let accessToken = '';
let refreshToken = '';

app.get('/auth', (req, res) => {
  const clientId = process.env.CLIENT_ID;
  const redirectUri = process.env.REDIRECT_URI;
  const authUrl = `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=openid`;
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('Missing code');
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
    refreshToken = tokenResponse.data.refresh_token;

    console.log('✅ Token armazenado com sucesso');
    res.send(`Autorizado com sucesso. Código recebido: ${code}`);
  } catch (error) {
    console.error('Erro ao buscar token:', error.response?.data || error.message);
    res.status(500).send('Erro ao buscar token');
  }
});

app.get('/enviar-oc', async (req, res) => {
  if (!accessToken) {
    return res.status(401).send('Token ausente. Faça login em /auth.');
  }

  try {
    const resultado = await enviarOrdemCompraReal(accessToken);
    res.json({ sucesso: true, resposta: resultado });
  } catch (err) {
    console.error('Erro ao enviar OC:', err.response?.data || err.message);
    res.status(500).send('Erro ao enviar OC');
  }
});

app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
});