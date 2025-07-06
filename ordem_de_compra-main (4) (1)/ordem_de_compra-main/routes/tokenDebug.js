const express = require('express');
const router = express.Router();
const { getAccessToken } = require('../services/tokenService');

// Rota temporária para exibir o token atual
router.get('/', (req, res) => {
  const token = getAccessToken();

  if (token) {
    res.json({ token });
  } else {
    res.status(404).json({ erro: 'Token não encontrado ou expirado.' });
  }
});

module.exports = router;
