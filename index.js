require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { enviarOrdemCompraReal } = require('./services/enviarOrdem');

const app = express();
const port = process.env.PORT || 8080;

let accessToken = null;

// Rota para iniciar o processo de autorização OAuth2
app.get('/auth', (req, res) => {
  console.log('🔍 /auth route hit');
  const clientId = process.env.CLIENT_ID;
  const redirectUri = process.env.REDIRECT_URI;
  const authUrl = `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=openid`;
  console.log('➡️ Redirecionando para:', authUrl);
  res.redirect(authUrl);
});

// Rota de callback que recebe o código e troca por token
app.get('/callback', async (req, res) => {
  console.log('🔍 /callback route hit');
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code');
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
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    accessToken = tokenResponse.data.access_token;
    console.log('✅ Access token recebido e armazenado');
    res.send('Token de acesso armazenado com sucesso.');
  } catch (err) {
    console.error('❌ Erro ao trocar código por token:', err.response?.data || err.message);
    res.status(500).send('Erro ao autenticar com a Tiny.');
  }
});

// Rota protegida para enviar ordem
app.get('/enviar-oc', async (req, res) => {
  console.log('🔍 /enviar-oc route hit');
  if (!accessToken) return res.status(401).send('No access token. Call /auth first.');
  try {
    const result = await enviarOrdemCompraReal(accessToken);
    res.json({ sucesso: true, tiny: result });
  } catch (error) {
    console.error('❌ Erro ao enviar OC:', error.response?.data || error.message);
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});