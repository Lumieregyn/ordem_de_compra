require('dotenv').config();
const express = require('express');
const axios = require('axios');
const qs = require('qs');
const pLimit = require('p-limit');
const { gerarOrdemCompra } = require('./services/ocGenerator');
const { enviarOrdemCompra } = require('./services/enviarOrdem');
const { inserirMarca, marcaExiste } = require('./services/pinecone');

const app = express();
const port = process.env.PORT || 8080;

let accessToken = null;

// Rota de autenticação OAuth2
app.get('/auth', (req, res) => {
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

// Callback da autenticação
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
    console.log('✅ Token de acesso armazenado.');
    res.send('Autenticação concluída com sucesso! Agora você pode chamar /enviar-oc');
  } catch (error) {
    console.error('❌ Erro ao obter token:', error.response?.data || error.message);
    res.send('Erro ao obter token.');
  }
});

// Envia ordem de compra para a Tiny
app.get('/enviar-oc', async (req, res) => {
  if (!accessToken) {
    return res.send('No access token. Call /auth first.');
  }

  try {
    const xml = gerarOrdemCompra();
    const response = await enviarOrdemCompra(accessToken, xml);
    console.log('✅ Ordem de compra enviada!');
    console.log(response);
    res.send('Ordem de compra enviada com sucesso!');
  } catch (error) {
    console.error('❌ Erro no envio da OC:', error.message);
    res.send('Erro ao enviar ordem de compra.');
  }
});

// Listar marcas com paralelismo e controle
app.get('/listar-marcas', async (req, res) => {
  const token = process.env.TINY_API_TOKEN;
  const marcasUnicas = new Set();
  let pagina = 1;
  let totalProdutos = 0;
  let totalInseridas = 0;
  const limit = pLimit(5);
  const inicio = Date.now();

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

      console.log(`🎯 Página ${pagina} com ${produtos.length} produtos.`);

      const tarefas = produtos.map(p => limit(async () => {
        totalProdutos++;
        const marca = p.produto?.marca?.trim();
        if (marca && !marcasUnicas.has(marca)) {
          const existe = await marcaExiste(marca);
          if (!existe) {
            await inserirMarca(marca);
            marcasUnicas.add(marca);
            totalInseridas++;
          }
        }
      }));

      await Promise.all(tarefas);

      const ultimaPagina = response.data?.retorno?.numero_paginas;
      if (!ultimaPagina || pagina >= ultimaPagina) break;
      pagina++;
    }

    const fim = Date.now();
    const duracao = ((fim - inicio) / 1000).toFixed(1);

    console.log(`✅ Concluído em ${duracao}s — ${pagina} páginas`);
    console.log(`🔢 Produtos analisados: ${totalProdutos}`);
    console.log(`🏷️ Novas marcas indexadas: ${totalInseridas}`);

    res.json({
      sucesso: true,
      paginas: pagina,
      produtos: totalProdutos,
      marcasNovas: totalInseridas,
      tempo: duracao + 's'
    });

  } catch (error) {
    console.error('❌ Erro ao listar marcas:', error.response?.data || error.message);
    res.status(500).json({ error: 'Erro ao listar marcas.' });
  }
});

// Inicializa servidor
app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
});
