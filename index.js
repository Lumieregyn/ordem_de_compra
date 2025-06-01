require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { getAccessToken } = require('./services/tokenService');
const { processarProdutosTiny } = require('./services/tinyService');
const { inferirMarcaViaIA } = require('./services/openaiMarcaService');
const { getProdutoFromTinyV3 } = require('./services/tinyProductService');

const listarMarcasRoute = require('./routes/listarMarcas');
const webhookPedidoRoute = require('./routes/webhookPedido');
const tokenDebugRoute = require('./routes/tokenDebug');
const authRoutes = require('./routes/auth');
const tokenInfoRoute = require('./routes/tokenInfo');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('🚀 API Tiny Sync ativa.');
});

app.use('/', authRoutes);
app.use('/token/info', tokenInfoRoute);
app.use('/debug-token', tokenDebugRoute);

app.get('/sync-produtos', async (req, res) => {
  try {
    const resultado = await processarProdutosTiny();
    res.json(resultado);
  } catch (err) {
    console.error('❌ Erro ao sincronizar produtos:', err);
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
    console.error('❌ Erro ao testar IA de marca:', err);
    res.status(500).send('Erro na inferência de marca');
  }
});

app.use('/listar-marcas', listarMarcasRoute);
app.use('/webhook-pedido', webhookPedidoRoute);

app.listen(PORT, () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`);
});
