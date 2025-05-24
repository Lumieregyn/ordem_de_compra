// index.js

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { enviarOrdemCompraReal } = require('./services/enviarOrdem');

const app = express();
const port = process.env.PORT || 8080;

let accessToken;

// Rota de autorização
app.get('/auth', (req, res) => {
  console.log('🔍 /auth route hit');
  const clientId = process.env.CLIENT_ID;
  const redirectUri = process.env.REDIRECT_URI;
  const authUrl = `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth`
    + `?response_type=code`
    + `&client_id=${clientId}`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + `&scope=openid`;

  console.log('➡️ Redirecionando para:', authUrl);
  res.redirect(authUrl);
});

// Callback para receber o código
app.get('/callback', async (req, res) => {
  console.log('🔍 /callback route hit');
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
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    accessToken = tokenResponse.data.access_token;
    console.log('✅ Tiny access token stored');
    res.send(`Tiny auth code received: ${code}`);
  } catch (err) {
    console.error('Error fetching access token', err.response?.data || err);
    res.status(500).send('Error fetching access token');
  }
});

// Rota para disparar o envio da OC
app.get('/enviar-oc', async (req, res) => {
  console.log('🔍 /enviar-oc route hit');
  if (!accessToken) {
    return res.status(401).send('No access token. Call /auth first.');
  }
  try {
    const result = await enviarOrdemCompraReal(accessToken);
    res.json({ sucesso: true, tiny: result });
  } catch (err) {
    console.error('Error sending order', err.response?.data || err.message);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
