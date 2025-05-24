require('dotenv').config();
const express = require('express');
const axios = require('axios');
const gerarOrdemCompra = require('./services/ocGenerator');
const enviarOrdem = require('./services/enviarOrdem');

const app = express();
const port = process.env.PORT || 8080;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;

app.get('/auth', (req, res) => {
  console.log('🔍 /auth route hit');
  const authUrl = 
    \`https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth?response_type=code&client_id=\${encodeURIComponent(clientId)}&redirect_uri=\${encodeURIComponent(redirectUri)}&scope=openid\`;
  console.log('➡️ Redirect to:', authUrl);
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  console.log('🔍 /callback route hit');
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');
  try {
    const tokenResp = await axios.post(
      'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const { access_token, refresh_token } = tokenResp.data;
    app.locals.accessToken = access_token;
    app.locals.refreshToken = refresh_token;
    res.send('Authorization successful! You may now call /enviar-oc.');
  } catch (err) {
    console.error(err);
    res.status(500).send('Token request failed');
  }
});

app.get('/enviar-oc', async (req, res) => {
  console.log('🔍 /enviar-oc route hit');
  const token = app.locals.accessToken;
  if (!token) return res.status(401).send('No access token. Call /auth first.');
  try {
    const xml = gerarOrdemCompra();
    const response = await enviarOrdem(xml, token);
    res.json(response.data);
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).send('Failed to send order');
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
