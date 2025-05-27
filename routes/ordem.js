const express = require('express');
const router = express.Router();

const { gerarOrdemCompra } = require('../services/ocGenerator');
const { enviarOrdemCompra } = require('../services/enviarOrdem');
const { getAccessToken } = require('../services/tokenService'); // Vamos criar na próxima etapa

// Envio de Ordem de Compra
router.post('/enviar-oc', async (req, res) => {
  const token = getAccessToken();
  if (!token) return res.status(401).send('Sem token. Chame /auth primeiro.');

  const dados = req.body || {};
  try {
    const xml = gerarOrdemCompra(dados);
    const result = await enviarOrdemCompra(token, xml);
    if (!result.success) {
      return res.status(500).json({ erro: result.error });
    }
    res.json(result.dados);
  } catch (err) {
    console.error('❌ Erro ao processar OC:', err);
    res.status(400).json({ erro: 'Falha ao gerar ou enviar OC.' });
  }
});

module.exports = router;
