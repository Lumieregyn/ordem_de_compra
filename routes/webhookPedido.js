const express = require('express');
const router = express.Router();
const { getProdutoFromTinyV3 } = require('../services/tinyProductService');
const { getFornecedorIdPorNome } = require('../services/tinyFornecedorService');
const { analisarPedidoViaIA } = require('../services/openaiMarcaService');
const { enviarOrdemCompra } = require('../services/enviarOrdem');

router.post('/', async (req, res) => {
  try {
    const pedido = req.body;

    if (!pedido || !pedido.itens || !pedido.itens.length) {
      return res.status(400).json({ erro: 'Pedido inválido ou sem itens.' });
    }

    const resultados = [];

    for (const item of pedido.itens) {
      const produtoId = item.produto?.id;
      const quantidade = item.quantidade;
      const valorUnitario = item.valorUnitario;

      if (!produtoId) {
        console.warn('❌ Item sem produto ID, ignorado.');
        continue;
      }

      // 1. Buscar produto na Tiny
      const produto = await getProdutoFromTinyV3(produtoId);
      const sku = produto.sku;
      const marca = produto.marca?.nome?.trim();

      if (!marca) {
        console.warn(`❌ Produto ${sku} sem marca, ignorando`);
        resultados.push({ produtoSKU: sku, status: 'sem marca' });
        continue;
      }

      // 2. Buscar ID do fornecedor
      const idFornecedor = await getFornecedorIdPorNome(marca);
      if (!idFornecedor) {
        resultados.push({ produtoSKU: sku, status: 'fornecedor não encontrado', marca });
        continue;
      }

      // 3. IA decide se gera OC
      const decisaoIA = await analisarPedidoViaIA({
        produto,
        quantidade,
        valorUnitario,
        marca,
        fornecedor: marca // nome do fornecedor
      });

      const itemIA = decisaoIA?.itens?.[0];
      if (itemIA?.deveGerarOC) {
        // 4. Gera OC real
        const respostaOC = await enviarOrdemCompra({
          produtoId,
          quantidade,
          valorUnitario,
          idFornecedor
        });

        resultados.push({
          produtoSKU: sku,
          fornecedor: marca,
          ocCriada: true,
          ocInfo: respostaOC || null
        });
      } else {
        resultados.push({
          produtoSKU: sku,
          fornecedor: marca,
          ocCriada: false,
          motivo: itemIA?.motivo || 'IA recusou sem explicação'
        });
      }
    }

    res.json({ status: 'ok', resultados });

  } catch (err) {
    console.error('❌ Erro geral no webhook:', err.message || err);
    res.status(500).json({ erro: 'Erro ao processar pedido' });
  }
});

module.exports = router;
