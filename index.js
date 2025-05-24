require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { enviarOrdemCompraReal } = require('./services/enviarOrdem');

const app = express();
const port = process.env.PORT || 8080;

// Atenção: aqui usamos exatamente REDIRECT_URI, igual na sua configuração de ambiente
const redirectUri = process.env.REDIRECT_URI;
if (!redirectUri) {
  console.error('⚠️  Variável de ambiente REDIRECT_URI não encontrada!');
  process.exit(1);
}

let accessToken;

// Rota para iniciar o fluxo OAuth2
app.get('/auth', (req, res) => {
  console.log('🔍 /auth route hit');
  const clientId = process.env.CLIENT_ID;
  if (!clientId) {
    return res.status(500).send('⚠️ CLIENT_ID não configurado');
  }

  const authUrl = `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth?` +
                  `response_type=code&client_id=${clientId}&` +
                  `redirect_uri=${encodeURIComponent(redirectUri)}&` +
                  `scope=openid`;
  console.log('➡️ Redirecting to:', authUrl);
  res.redirect(authUrl);
});

// Callback que recebe o “code” e troca pelo token
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
        redirect_uri: redirectUri,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    accessToken = tokenResponse.data.access_token;
    console.log('✅ Tiny access token stored');
    res.send(`Tiny auth code received: ${code}`);
  } catch (error) {
    console.error('❌ Error fetching access token:', error.response?.data || error.message);
    res.status(500).send('Error fetching access token');
  }
});

// Rota que envia a ordem de compra (usa o token obtido acima)
app.get('/enviar-oc', async (req, res) => {
  console.log('🔍 /enviar-oc route hit');
  if (!accessToken) {
    return res.status(401).send('No access token. Call /auth first.');
  }

  try {
    const result = await enviarOrdemCompraReal(accessToken);
    res.json({ sucesso: true, tiny: result });
  } catch (error) {
    console.error('❌ Error sending order:', error.response?.data || error.message);
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
