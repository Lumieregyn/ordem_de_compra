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
const authRoutes = require('./routes/auth'); // ✅ Confirmação explícita
const tokenInfoRoute = require('./routes/tokenInfo'); // ✅ Nova rota ativa

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// 🌐 Healthcheck
app.get('/', (req, res) => {
  res.send('🚀 API Tiny Sync ativa.');
});

// 🔐 Rotas de autenticação com Tiny
app.use('/', authRoutes); // inclui /auth e /callback

// 📊 Verificar tempo restante do token
app.use('/token/info', tokenInfoRoute);

// 🛠️ Debug do token atual (bruto)
app.use('/debug-token', tokenDebugRoute);

// 🔄 Sincronizar produtos Tiny (se necessário)
app.get('/sync-produtos', async (req, res) => {
  try {
    const resultado = await processarProdutosTiny();
    res.json(resultado);
  } catch (err) {
    console.error('❌ Erro ao sincronizar produtos:', err);
    res.status(500).send('Erro na sincronização');
  }
});

// 🤖 Testar IA de marca por ID
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

// 📦 Listar marcas únicas
app.use('/listar-marcas', listarMarcasRoute);

// 📩 Webhook para pedidos Tiny
app.use('/webhook-pedido', webhookPedidoRoute);

// 🚀 Início do servidor
app.listen(PORT, () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`);
});
