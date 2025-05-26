require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { gerarOrdemCompra } = require('./services/ocGenerator');
const { enviarOrdemCompra } = require('./services/enviarOrdem');
const xml2js = require('xml2js');
const qs = require('qs');

const app = express();
const port = process.env.PORT || 8080;

let accessToken = null;

// 🔐 Início do fluxo de autenticação
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

// 🔁 Callback da autenticação
app.get('/callback', async (req, res) => {
  console.log('📥 /callback route hit');
  const code = req.query.code;

  if (!code) {
    return res.send('Erro: código de autorização ausente.');
  }

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
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    accessToken = response.data.access_token;
    console.log('✅ Token de acesso armazenado.');
    res.send('Autenticação concluída com sucesso! Agora você pode chamar /enviar-oc');
  } catch (error) {
    console.error('❌ Erro ao obter access token:', error.response?.data || error.message);
    res.send('Erro ao obter token.');
  }
});

// 📦 Enviar Ordem de Compra
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

// 🏷️ Listar marcas cadastradas na Tiny
app.get('/listar-marcas', async (req, res) => {
  const token = accessToken || process.env.TINY_API_TOKEN;

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso não encontrado.' });
  }

  const marcasUnicas = new Set();
  let pagina = 1;
  let continuar = true;

  try {
    while (continuar) {
      const response = await axios.post(
        'https://api.tiny.com.br/api2/produtos.pesquisa.php',
        null,
        {
          params: {
            token,
            formato: 'json',
            pagina,
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const produtos = response.data?.retorno?.produtos || [];

      if (pagina === 1) {
        console.log('🔎 Primeira página recebida:', JSON.stringify(produtos, null, 2));
      }

      produtos.forEach((p) => {
        const marca = p.produto?.marca;
        if (marca) {
          marcasUnicas.add(marca.trim());
        }
      });

      const ultimaPagina = parseInt(response.data?.retorno?.numero_paginas || 1);
      continuar = pagina < ultimaPagina;
      pagina++;
    }

    res.json({
      marcas: Array.from(marcasUnicas).sort(),
      total: marcasUnicas.size
    });

  } catch (error) {
    console.error('❌ Erro ao buscar marcas:', error.response?.data || error.message);
    res.status(500).json({ error: 'Erro ao consultar marcas na API da Tiny.' });
  }
});

// 🚀 Start do servidor
app.listen(port, () => {
  console.log(`🚀 Servidor rodando na porta ${port}`);
});
