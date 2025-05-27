// index.js completo e ajustado com caminho absoluto e modularização correta

const express = require('express');
const dotenv = require('dotenv');
dotenv.config();

const path = require('path');
const { listarMarcas } = require(path.join(__dirname, 'rotas', 'listarMarcas'));
const { gerarOrdemCompra } = require('./services/ocGenerator');
const { enviarOrdemCompra } = require('./services/enviarOrdem');
const { MongoClient } = require('mongodb');
const axios = require('axios');
const qs = require('qs');

const app = express();
const port = process.env.PORT || 8080;

let accessToken = null;

// Conexão MongoDB
const mongoClient = new MongoClient(process.env.MONGO_URI);
let produtosCollection;

mongoClient.connect().then(() => {
  const db = mongoClient.db('ordens');
  produtosCollection = db.collection('produtos');
  console.log('✅ Conectado ao MongoDB');
});

// Autenticação Tiny
app.get('/auth', (req, res) => {
  const authUrl = `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth?response_type=code&client_id=${encodeURIComponent(process.env.CLIENT_ID)}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&scope=openid`;
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('Erro: código de autorização ausente.');

  try {
    const response = await axios.post(
      'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
      qs.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        redirect_uri: process.env.REDIRECT_URI
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    accessToken = response.data.access_token;
    res.send('Autenticação concluída com sucesso!');
  } catch (error) {
    res.send('Erro ao obter token.');
  }
});

// Enviar Ordem de Compra
app.get('/enviar-oc', async (req, res) => {
  if (!accessToken) return res.send('No access token. Call /auth first.');

  try {
    const xml = gerarOrdemCompra();
    const response = await enviarOrdemCompra(accessToken, xml);
    res.send('Ordem de compra enviada com sucesso!');
  } catch (error) {
    res.send('Erro ao enviar ordem de compra.');
  }
});

// Rota principal: listar marcas
app.get('/listar-marcas', listarMarcas);

// Buscar produto por código direto no Mongo
app.get('/produto/:codigo', async (req, res) => {
  const codigo = req.params.codigo;
  if (!codigo) return res.status(400).json({ erro: 'Código é obrigatório' });

  try {
    const produto = await produtosCollection.findOne({ codigo });
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });
    res.json(produto);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao buscar produto' });
  }
});

// Inicialização do servidor
app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
});
