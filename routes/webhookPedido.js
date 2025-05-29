const express = require('express');
const router = express.Router();
const { analisarPedidoViaIA } = require('../services/openaiMarcaService');
const axios = require('axios');
const { getAccessToken } = require('../services/tokenService');

router.post('/', async (req, res) => {
  try {
    const pedido = req.body;

    if (!pedido || !pedido.itens || !pedido.itens.length) {
      return res.status(400).json({ erro: 'Pedido inválido ou sem itens.' });
    }

    console.log(`📦 Pedido recebido: ${pedido.numeroPedido || 'sem número'}`);

    // 1. Analisar via IA
    const resultadoIA = await analisarPedidoViaIA(pedido);

    // 2. Para cada item marcado como "deveGerarOC", simular log de geração
    for (const item of resultadoIA.itens || []) {
      if (item.deveGerarOC) {
        console.log(`✅ Ordem de compra recomendada para SKU ${item.produtoSKU}`);
        console.log(`→ Fornecedor: ${item.fornecedor}`);
        console.log(`→ Motivo: ${item.motivo}`);
      } else {
        console.log(`⛔️ OC não recomendada para SKU ${item.produtoSKU}`);
        console.log(`→ Motivo: ${item.motivo}`);
      }
    }

    res.json({ resultado: resultadoIA });

  } catch (err) {
    console.error('❌ Erro ao processar pedido:', err);
    res.status(500).json({ erro: 'Erro ao processar pedido' });
  }
});

module.exports = router;
