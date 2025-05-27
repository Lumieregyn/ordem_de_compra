// Estrutura reorganizada — Pinecone removido e MongoDB com fallback de marca ativado

// index.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const qs = require('qs');
const pLimit = require('p-limit');
const { MongoClient } = require('mongodb');
const { gerarOrdemCompra } = require('./services/ocGenerator');
const { enviarOrdemCompra } = require('./services/enviarOrdem');

const app = express();
const port = process.env.PORT || 8080;
let accessToken = null;

// MongoDB connection
const mongoClient = new MongoClient(process.env.MONGO_URI);
let produtosCollection;

mongoClient.connect().then(() => {
  const db = mongoClient.db('ordens');
  produtosCollection = db.collection('produtos');
  console.log('✅ Conectado ao MongoDB');
});

async function salvarOuAtualizarProduto({ codigo, nome, marca }) {
  if (!codigo || !nome || !marca) return;
  await produtosCollection.updateOne(
    { codigo },
    {
      $set: {
        nome,
        marca,
        atualizado_em: new Date().toISOString()
      }
    },
    { upsert: true }
  );
}

// 🔐 Autenticação Tiny
app.get('/auth', (req, res) => {
  const clientId = process.env.CLIENT_ID;
  const redirectUri = process.env.REDIRECT_URI;
  const authUrl = https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=openid;
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

// 📦 Envia OC
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

// 🧠 Listar marcas e salvar produtos no MongoDB (sem Pinecone)
app.get('/listar-marcas', async (req, res) => {
  const token = process.env.TINY_API_TOKEN;
  let pagina = 1;
  let totalProdutos = 0;
  const inicio = Date.now();
  const limit = pLimit(5);

  try {
    while (true) {
      const response = await axios.post(
        'https://api.tiny.com.br/api2/produtos.pesquisa.php',
        null,
        {
          params: {
            token,
            formato: 'json',
            pagina
          },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
      );

      const produtos = response.data?.retorno?.produtos || [];
      if (!produtos.length) break;

      console.log([Página ${pagina}] Processando ${produtos.length} produtos...);

      const tarefas = produtos.map(p => limit(async () => {
        totalProdutos++;
        const codigo = p.produto?.codigo;
        const nome = p.produto?.nome?.trim();
        let marca = p.produto?.marca?.trim();

        // Fallback: extrai a marca com base no nome
        if (!marca && nome) {
          const match = nome.match(/^([^-–]+)/); // pega antes do hífen
          if (match && match[1]) {
            marca = match[1].trim();
          }
        }

        if (codigo && nome && marca) {
          await salvarOuAtualizarProduto({ codigo, nome, marca });
        }
      }));

      await Promise.all(tarefas);
      pagina++;
    }

    const fim = Date.now();
    const duracao = ((fim - inicio) / 1000).toFixed(1);

    console.log(✅ Concluído: ${pagina} páginas processadas);
    console.log(🔢 Total de produtos analisados: ${totalProdutos});
    console.log(🕒 Tempo total: ${duracao} segundos);

    res.json({
      sucesso: true,
      paginas: pagina,
      produtos: totalProdutos,
      tempo: duracao + 's'
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar produtos.' });
  }
});

// 🔍 Buscar produto por código
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

// 🚀 Inicializa servidor
app.listen(port, () => {
  console.log(🚀 Servidor rodando na porta ${port});
});
