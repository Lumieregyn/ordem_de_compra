
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { gerarOrdemCompra } = require('./services/ocGenerator');
const { enviarOrdemCompraReal } = require('./services/enviaOrdem');

const app = express();
const PORT = process.env.PORT || 8080;
let accessToken = null;

// Rota de teste raiz
app.get('/', (req, res) => {
  res.send('🚀 API Ordem de Compra está no ar!');
});

// Rota para iniciar autenticação
app.get('/auth', (req, res) => {
  const clientId = process.env.CLIENT_ID;
  const redirectUri = process.env.REDIRECT_URI;

  console.log('🔍 /auth route hit');
  console.log('📦 Env vars:', { clientId, redirectUri });

  if (!clientId || !redirectUri) {
    return res.status(500).send('❌ CLIENT_ID ou REDIRECT_URI ausentes.');
  }

  const authUrl = `https://api.tiny.com.br/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  res.redirect(authUrl);
});

// Callback após autenticação
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  console.log('🔁 Callback com código:', code);

  if (!code) {
    return res.status(400).send('❌ Código de autorização ausente.');
  }

  try {
    const response = await axios.post('https://api.tiny.com.br/oauth2/token', null, {
      params: {
        grant_type: 'authorization_code',
        code: code,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        redirect_uri: process.env.REDIRECT_URI
      },
    });

    accessToken = response.data.access_token;
    console.log('✅ Token obtido:', accessToken);
    res.send('✅ Token obtido com sucesso.');
  } catch (error) {
    console.error('❌ Erro ao trocar código por token:', error.response?.data || error.message);
    res.status(500).send('❌ Falha ao obter token.');
  }
});

// Rota para envio de OC
app.get('/enviar-oc', async (req, res) => {
  if (!accessToken) {
    return res.status(401).send('❌ Token ausente. Acesse /auth primeiro.');
  }

  try {
    const pedido = require('./pedido_aprovado.json');
    const xmlOC = gerarOrdemCompra(pedido);
    const resultado = await enviarOrdemCompraReal(xmlOC, accessToken);
    res.send(resultado);
  } catch (error) {
    console.error('❌ Erro ao enviar OC:', error.response?.data || error.message);
    res.status(500).send('❌ Falha ao enviar OC.');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
