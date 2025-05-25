require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { gerarOrdemCompra } = require('./services/ocGenerator');
const { enviarOrdemCompra } = require('./services/enviarOrdem');
const xml2js = require('xml2js');

const app = express();
const port = process.env.PORT || 8080;

let accessToken = null;

app.get('/auth', (req, res) => {
  console.log('🔍 /auth route hit');
  const clientId = process.env.CLIENT_ID;
  const redirectUri = process.env.REDIRECT_URI;
  const authUrl = `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=openid`;

  console.log('➡️ Redirecionando para:', authUrl);
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  console.log('📥 /callback route hit');
  const code = req.query.code;

  if (!code) {
    return res.send('Erro: código de autorização ausente.');
  }

  try {
    const response = await axios.post('https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token', null, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      params: {
        grant_type: 'authorization_code',
        code,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        redirect_uri: process.env.REDIRECT_URI
      }
    });

    accessToken = response.data.access_token;
    console.log('✅ Token de acesso armazenado.');
    res.send('Autenticação concluída com sucesso! Agora você pode chamar /enviar-oc');
  } catch (error) {
    console.error('❌ Erro ao obter access token:', error.response?.data || error.message);
    res.send('Erro ao obter token.');
  }
});

app.get('/enviar-oc', async (req, res) => {
  if (!accessToken) {
    return res.send('No access token. Call /auth first.');
  }

  try {
    const xml = gerarOrdemCompra();
    const response = await enviarOrdemCompra(accessToken, xml);

    console.log('✅ Ordem de compra enviada com sucesso!');
    console.log(response);

    res.send('Ordem de compra enviada com sucesso!');
  } catch (error) {
    console.error('❌ Erro no envio da OC:', error.message);
    res.send('Erro ao enviar ordem de compra.');
  }
});

app.get('/listar-marcas', async (req, res) => {
  if (!accessToken) {
    return res.status(401).json({ error: 'Não autenticado. Faça /auth primeiro.' });
  }

  try {
    const response = await axios.get('https://api.tiny.com.br/api2/produto.pesquisa.php', {
      params: {
        token: accessToken,
        formato: 'json'
      }
    });

    const produtos = response.data.retorno.produtos || [];
    const marcas = new Set();

    produtos.forEach((p) => {
      if (p.produto && p.produto.marca) {
        marcas.add(p.produto.marca);
      }
    });

    res.json({ marcas: Array.from(marcas) });
  } catch (error) {
    console.error('❌ Erro ao listar marcas:', error.response?.data || error.message);
    res.status(500).json({ error: 'Erro ao listar marcas.' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
});
