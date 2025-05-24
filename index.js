require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { gerarOrdemCompra } = require('./services/ocGenerator');

const app = express();
const port = process.env.PORT || 8080;

// Tiny OAuth2 credentials
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;

let accessToken = null;

// Start OAuth2 flow
app.get('/auth', (req, res) => {
  console.log('🔍 /auth route hit');
  if (!clientId || !redirectUri) {
    return res.status(500).send('Missing CLIENT_ID or REDIRECT_URI');
  }
  const authUrl = `https://api.tiny.com.br/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  res.redirect(authUrl);
});

// OAuth2 callback
app.get('/callback', async (req, res) => {
  console.log('🔍 /callback route hit');
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code');
  try {
    const response = await axios.post('https://api.tiny.com.br/oauth2/token', null, {
      params: {
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri
      }
    });
    accessToken = response.data.access_token;
    console.log('✅ Access token obtained:', accessToken);
    res.send('✅ Access token obtained');
  } catch (err) {
    console.error('❌ Error fetching token:', err.response?.data || err.message);
    res.status(500).send('Error fetching token');
  }
});

// Generate and send purchase order
app.get('/enviar-oc', async (req, res) => {
  console.log('🔍 /enviar-oc route hit');
  if (!accessToken) return res.status(401).send('No access token. Call /auth first.');
  const pedido = require('./pedido_aprovado.json');
  const xmlPayload = gerarOrdemCompra(pedido);
  try {
    const result = await axios.post('https://api.tiny.com.br/api2/ordem.compra.incluir.php', null, {
      params: {
        token: accessToken,
        xml: xmlPayload,
        formato: 'json'
      }
    });
    console.log('✅ Tiny API response:', result.data);
    res.json({ success: true, data: result.data });
  } catch (err) {
    console.error('❌ Error sending order:', err.response?.data || err.message);
    res.status(500).send('Error sending order');
  }
});

// 404 handler
app.use((req, res) => res.status(404).send(`Cannot GET ${req.path}`));

app.listen(port, () => console.log(`🚀 Server running on port ${port}`));