require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { authCallback, getAccessToken } = require('./services/tokenService');
const { processarProdutosTiny } = require('./services/tinyService');
const { inferirMarcaViaIA } = require('./services/openaiMarcaService');
const { getProdutoFromTinyV3 } = require('./services/tinyProductService');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('🚀 API Tiny Sync ativa.');
});

app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Código ausente');

  try {
    await authCallback(code);
    res.send('✅ Token salvo com sucesso.');
  } catch (err) {
    console.error('Erro no callback:', err);
    res.status(500).send('Erro ao salvar token');
  }
});

app.get('/token', (req, res) => {
  const token = getAccessToken();
  if (!token) return res.status(404).send('Token não encontrado');
  res.send({ token });
});

app.get('/sync-produtos', async (req, res) => {
  try {
    const resultado = await processarProdutosTiny();
    res.json(resultado);
  } catch (err) {
    console.error('Erro ao sincronizar produtos:', err);
    res.status(500).send('Erro na sincronização');
  }
});

app.get('/testar-marca-ia/:id', async (req, res) => {
  const produtoId = req.params.id;
  try {
    const produto = await getProdutoFromTinyV3(produtoId);
    const marcaInferida = await inferirMarcaViaIA(produto);
    res.json({ id: produtoId, sku: produto?.sku, marcaInferida });
  } catch (err) {
    console.error('Erro ao testar IA de marca:', err);
    res.status(500).send('Erro na inferência de marca');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`);
});
