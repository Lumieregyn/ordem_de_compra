const express = require('express');
const router = express.Router();
const axios = require('axios');

const API_V2_LIST_URL = 'https://api.tiny.com.br/api2/produtos.pesquisa.php';
const TINY_API_TOKEN = process.env.TINY_API_TOKEN;

router.get('/', async (req, res) => {
  try {
    let pagina = 1;
    const marcas = new Set();

    while (true) {
      const response = await axios.post(API_V2_LIST_URL, null, {
        params: { token: TINY_API_TOKEN, formato: 'json', pagina },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const produtos = response.data?.retorno?.produtos || [];
      if (!produtos.length) break;

      for (const { produto } of produtos) {
        const marca = produto?.marca?.trim();
        if (marca) {
          marcas.add(marca);
        }
      }

      pagina++;
    }

    res.json(Array.from(marcas).sort());
  } catch (err) {
    console.error('❌ Erro ao listar marcas da Tiny:', err);
    res.status(500).json({ erro: 'Falha ao obter marcas' });
  }
});

module.exports = router;
