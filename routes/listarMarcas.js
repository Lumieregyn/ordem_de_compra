const express = require('express');
const axios = require('axios');
const router = express.Router();

// Rota para listar marcas únicas de todos os produtos cadastrados na Tiny
router.get('/listar-marcas', async (req, res) => {
  const accessToken = process.env.TINY_API_TOKEN; // Token salvo no Railway
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
            token: accessToken,
            formato: 'json',
            pagina,
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const produtos = response.data?.retorno?.produtos || [];

      produtos.forEach(p => {
        const marca = p.produto?.marca;
        if (marca) {
          marcasUnicas.add(marca.trim());
        }
      });

      const ultimaPagina = response.data?.retorno?.numero_paginas || 1;
      continuar = pagina < ultimaPagina;
      pagina++;
    }

    res.json({
      marcas: Array.from(marcasUnicas).sort(),
      total: marcasUnicas.size
    });

  } catch (error) {
    console.error('❌ Erro ao buscar marcas:', error.response?.data || error.message);
    res.status(500).send('Erro ao consultar marcas na API da Tiny.');
  }
});

module.exports = router;
