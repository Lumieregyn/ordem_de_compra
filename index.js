require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { generateOC } = require('./services/ocGenerator');

const app = express();
const port = process.env.PORT || 8080;

// Carrega as credenciais do Tiny e URIs a partir das variáveis de ambiente
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;

// Rota para iniciar o fluxo OAuth2 no Tiny
app.get('/auth', (req, res) => {
  console.log('🔍 /auth route hit');
  if (!clientId || !redirectUri) {
    return res
      .status(500)
      .send('Faltam as variáveis CLIENT_ID ou REDIRECT_URI');
  }
  const authUrl = `https://api.tiny.com.br/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}`;
  return res.redirect(authUrl);
});

// Callback que o Tiny chama após o usuário autorizar
app.get('/callback', async (req, res) => {
  console.log('🔍 /callback route hit');
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Parâmetro "code" não fornecido');
  }
  // Aqui você trocaria code por access_token (fluxo OAuth2)
  // Ex.: fetch('https://api.tiny.com.br/oauth2/token', { ... })
  return res.send(`Código recebido do Tiny: ${code}`);
});

// Gera a OC com base no pedido salvo em JSON
app.get('/enviar-oc', (req, res) => {
  console.log('🔍 /enviar-oc route hit');
  try {
    const pedidoRaw = fs.readFileSync(
      path.join(__dirname, 'pedido_aprovado.json'),
      'utf-8'
    );
    const pedido = JSON.parse(pedidoRaw);
    const oc = generateOC(pedido);
    return res.json(oc);
  } catch (err) {
    console.error('Erro ao gerar OC:', err);
    return res.status(500).send('Erro ao gerar ordem de compra');
  }
});

// Health-check ou página inicial
app.get('/', (req, res) => res.send('API de Ordem de Compra Inteligente OK'));

// Inicia o servidor
app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
});
