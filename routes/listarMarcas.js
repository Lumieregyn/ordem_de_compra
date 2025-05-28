const express = require('express');
const router = express.Router();
const { getProdutosCollection } = require('../services/mongoClient');

router.get('/', async (req, res) => {
  try {
    const collection = await getProdutosCollection();
    const produtos = await collection.find({}).toArray();
    res.json(produtos);
  } catch (error) {
    console.error('Erro ao listar marcas:', error);
    res.status(500).send('Erro ao listar marcas');
  }
});

module.exports = router;
