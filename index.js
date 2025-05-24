require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { enviarOrdemCompraReal } = require('./services/enviaOrdem');

const app = express();
const port = process.env.PORT || 8080;

let accessToken;

// Route to initiate Tiny OAuth2 authorization
app.get('/auth', (req, res) => {
  console.log('🔍 /auth route hit');
  const clientId = process.env.CLIENT_ID;
  const redirectUri = process.env.REDIRECT_URI;
  const authUrl = `https://api.tiny.com.br/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  res.redirect(authUrl);
});

// Callback route to exchange code for an access token
app.get('/callback', async (req, res) => {
  console.log('🔍 /callback route hit');
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('Missing code');
  }
  try {
    const tokenResponse = await axios.post(
      'https://api.tiny.com.br/oauth2/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        redirect_uri: process.env.REDIRECT_URI,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    accessToken = tokenResponse.data.access_token;
    console.log('✅ Tiny access token stored');
    res.send(`Tiny auth code received: ${code}`);
  } catch (error) {
    console.error('Error fetching access token', error.response?.data || error);
    res.status(500).send('Error fetching access token');
  }
});

// Route to send purchase order to Tiny
app.get('/enviar-oc', async (req, res) => {
  console.log('🔍 /enviar-oc route hit');
  if (!accessToken) {
    return res.status(401).send('No access token. Call /auth first.');
  }
  try {
    const result = await enviarOrdemCompraReal(accessToken);
    res.json({ sucesso: true, tiny: result });
  } catch (error) {
    console.error('Error sending order', error.response?.data || error.message);
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
