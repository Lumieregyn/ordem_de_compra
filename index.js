// index.js
require('dotenv').config();
const express = require('express');

const { conectarMongo, getProdutosCollection } = require('./services/mongoClient');
const ordemRoutes = require('./routes/ordem');
const authRoutes = require('./routes/auth');
const { listarMarcas } = require('./routes/listarMarcas');
const { getAccessToken } = require('./services/tokenService');

const axios = require('axios');

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

// Conecta ao MongoDB
conectarMongo();

// ----- Rotas principais modularizadas -----
app.use('/', authRoutes);     // /auth, /callback, /refresh
app.use('/', ordemRoutes);    // /enviar-oc

// ----- Listar Marcas da Tiny -----
app.get('/listar-marcas', listarMarcas);

// ----- Consulta produto salvo pelo código -----
app.get('/produto/:codigo', async (req, res) => {
  const { codigo } = req.params;
  if (!codigo) return res.status(400).json({ erro: 'Código é obrigatório' });

  try {
    const produto = await getProdutosCollection().findOne({ codigo });
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });
    res.json(produto);
  } catch (err) {
    console.error('❌ Erro ao buscar produto:', err);
    res.status(500).json({ erro: 'Erro interno ao buscar produto' });
  }
});

// ----- Teste: busca marca de um produto específico via v3 -----
app.get('/test-marca/:id', async (req, res) => {
  const token = getAccessToken();
  if (!token) return res.status(401).send('Sem token v3. Chame /auth primeiro.');

  try {
    const resp = await axios.get(
      `https://erp.tiny.com.br/public-api/v3/produtos/${req.params.id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    res.json(resp.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ----- Health Check -----
app.get('/', (req, res) => res.send('API Tiny-Mongo OK'));

// ----- Inicialização do servidor -----
app.listen(port, () => console.log(`🚀 Servidor rodando na porta ${port}`));
