require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const { gerarOrdemCompra } = require('./services/ocGenerator');

const app = express();
const port = process.env.PORT || 8080;

// Environment variables
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;

let accessToken = null;

app.get('/', (req, res) => {
  res.send('Ordem de Compra Backend');
});

// Route to initiate OAuth2 authorization
app.get('/auth', (req, res) => {
  const authUrl = `https://api.tiny.com.br/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  res.redirect(authUrl);
});

// Callback route to receive authorization code and exchange for access token
app.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Authorization code missing');
  }
  try {
    const tokenResponse = await axios.post('https://api.tiny.com.br/oauth2/token', null, {
      params: {
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      },
    });
    accessToken = tokenResponse.data.access_token;
    res.send(`Código recebido do Tiny: ${code}`);
  } catch (error) {
    console.error('Error obtaining access token:', error.response?.data || error.message);
    res.status(500).send('Erro ao obter token');
  }
});

// Route to send purchase order to Tiny
app.get('/enviar-oc', async (req, res) => {
  if (!accessToken) {
    return res.status(401).send('No access token. Call /auth first.');
  }
  try {
    const xmlBody = gerarOrdemCompra();
    const tinyResponse = await axios.post(
      'https://api.tiny.com.br/api2/Pedido.adicionar',
      xmlBody,
      {
        headers: {
          'Content-Type': 'application/xml',
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    // Parse XML response to JSON
    const parsed = await parseStringPromise(tinyResponse.data);
    res.json({ sucesso: true, tiny: parsed });
  } catch (error) {
    console.error('Error sending order:', error.response?.data || error.message);
    res.status(500).json({ sucesso: false, error: error.message });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log('🔍 /auth route hit to authorize');
  console.log('🔍 /enviar-oc route hit to send purchase order');
});
