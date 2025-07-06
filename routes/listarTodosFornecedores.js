const express = require('express');
const router = express.Router();

const { listarTodosFornecedores } = require('../services/tinyFornecedorService');

router.get('/', async (req, res) => {
  try {
    const fornecedores = await listarTodosFornecedores();
    res.json({ total: fornecedores.length, fornecedores });
  } catch (err) {
    console.error('❌ Erro ao listar fornecedores:', err);
    res.status(500).json({ erro: 'Erro ao listar fornecedores.' });
  }
});

module.exports = router;
