const express = require('express');
const router = express.Router();

const { getProdutoFromTinyV3 } = require('../services/tinyProductService');
const { getAccessToken } = require('../services/tokenService');
const { analisarPedidoViaIA } = require('../services/openaiMarcaService');
const { enviarOrdemCompra } = require('../services/enviarOrdem');
const axios = require('axios');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';

// 🔧 Normalização para texto
function normalizarTexto(txt) {
  return txt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .trim();
}

// 📦 Buscar todos os fornecedores
async function listarTodosFornecedores() {
  const token = getAccessToken();
  if (!token) return [];

  try {
    const response = await axios.get(`${TINY_API_V3_BASE}/contatos`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    return response.data._embedded?.contatos || [];
  } catch (err) {
    console.error('❌ Erro ao buscar fornecedores:', err.message);
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
      const sku = produto.sku || produto.codigo || 'DESCONHECIDO';
      console.log('🔎 SKU detectado:', sku);

      const marca = produto.marca?.nome?.trim() || 'Desconhecida';
      if (!marca) {
        resultados.push({ produtoSKU: sku, status: 'marca ausente' });
        continue;
      }

      // ⚙️ Análise da IA
      const respostaIA = await analisarPedidoViaIA(
        { produto, quantidade, valorUnitario, marca },
        fornecedores
      );

      const itemIA = respostaIA?.itens?.[0];
      if (!itemIA) {
        resultados.push({ produtoSKU: sku, status: 'resposta inválida da IA' });
        continue;
      }

      const nomeFornecedorIA = itemIA.fornecedor;
      const fornecedorMatch = fornecedores.find(f =>
        normalizarTexto(f.nome) === normalizarTexto(nomeFornecedorIA)
      );

      if (!fornecedorMatch) {
        console.warn(`❌ Nenhum fornecedor compatível com marca: ${nomeFornecedorIA}`);
        resultados.push({
          produtoSKU: sku,
          status: 'fornecedor não encontrado',
          marca
        });
        continue;
      }

      console.log('✅ Fornecedor compatível encontrado:', fornecedorMatch.nome);

      if (itemIA.deveGerarOC) {
        console.log('📤 Enviando OC com dados:', {
          produtoId,
          quantidade,
          valorUnitario,
          idFornecedor: fornecedorMatch.id
        });

        const respostaOC = await enviarOrdemCompra({
          produtoId,
          quantidade,
          valorUnitario,
          idFornecedor: fornecedorMatch.id
        });

        console.log('📥 Resposta da Tiny:', respostaOC);

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
