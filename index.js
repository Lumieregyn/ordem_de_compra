require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { gerarOrdemCompra } = require('./services/ocGenerator');
const { enviarOrdemCompra } = require('./services/enviarOrdem');

const app = express();
const port = process.env.PORT || 8080;

app.get('/auth', (req, res) => {
  console.log('🔍 /auth route hit');
  const clientId = process.env.CLIENT_ID;
  const redirectUri = process.env.REDIRECT_URI;
  const authUrl = `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=openid`;
  console.log('➡️ Redirecting to:', authUrl);
  res.redirect(authUrl);
});

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
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        redirect_uri: process.env.REDIRECT_URI,
        code
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const accessToken = tokenResponse.data.access_token;
    console.log('✅ Access token obtained');
    // Proceed to send order
    const xml = gerarOrdemCompra();
    const envioResponse = await enviarOrdemCompra(xml, accessToken);
    res.json(envioResponse.data);
  } catch (error) {
    console.error('❌ Error in callback:', error.response?.data || error.message);
    res.status(500).send('Error during OAuth callback');
  }
});

app.get('/enviar-oc', (req, res) => {
  res.send('Use /auth to start the flow.');
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
