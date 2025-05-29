const express = require('express');
const router = express.Router();

const { getProdutoFromTinyV3 } = require('../services/tinyProductService');
const { getAccessToken } = require('../services/tokenService');
const { analisarPedidoViaIA } = require('../services/openaiMarcaService');
const { enviarOrdemCompra } = require('../services/enviarOrdem');

const axios = require('axios');
const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';

// Buscar todos os contatos (fornecedores disponíveis)
async function listarTodosFornecedores() {
  const token = getAccessToken();
  if (!token) return [];

  try {
    const response = await axios.get(`${TINY_API_V3_BASE}/contatos`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    return response.data._embedded?.contatos || [];
  } catch (err) {
    console.error('❌ Erro ao buscar lista de fornecedores:', err.message);
    return [];
  }
}

router.post('/', async (req, res) => {
  try {
    const pedido = req.body;
    if (!pedido || !pedido.itens || !pedido.itens.length) {
      return res.status(400).json({ erro: 'Pedido inválido ou sem itens.' });
    }

    const fornecedores = await listarTodosFornecedores();
    const resultados = [];

    for (const item of pedido.itens) {
      const produtoId = item.produto?.id;
      const quantidade = item.quantidade || 1;
      const valorUnitario = item.valorUnitario || 0;

      if (!produtoId) {
        resultados.push({ status: 'produto sem ID válido', item });
        continue;
      }

      const produto = await getProdutoFromTinyV3(produtoId);
      const sku = produto.sku;
      const marca = produto.marca?.nome?.trim();

      if (!marca) {
        resultados.push({ produtoSKU: sku, status: 'marca ausente' });
        continue;
      }

      // IA analisa e decide
      const respostaIA = await analisarPedidoViaIA({
        produto,
        quantidade,
        valorUnitario,
        marca
      }, fornecedores);

      const itemIA = respostaIA?.itens?.[0];

      if (!itemIA) {
        resultados.push({ produtoSKU: sku, status: 'resposta inválida da IA' });
        continue;
      }

      const nomeFornecedorIA = itemIA.fornecedor;
      const fornecedorMatch = fornecedores.find(f =>
        f.nome.toLowerCase().trim() === nomeFornecedorIA?.toLowerCase().trim()
      );

      if (!fornecedorMatch) {
        resultados.push({
          produtoSKU: sku,
          status: 'fornecedor não encontrado',
          marca
        });
        continue;
      }

      if (itemIA.deveGerarOC) {
        const respostaOC = await enviarOrdemCompra({
          produtoId,
          quantidade,
          valorUnitario,
          idFornecedor: fornecedorMatch.id
        });

        resultados.push({
          produtoSKU: sku,
          fornecedor: fornecedorMatch.nome,
          ocCriada: true,
          ocInfo: respostaOC || null
        });
      } else {
        resultados.push({
          produtoSKU: sku,
          fornecedor: fornecedorMatch.nome,
          ocCriada: false,
          motivo: itemIA?.motivo || 'IA recusou'
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
