const express = require('express');
const router = express.Router();

const { getProdutoFromTinyV3 } = require('../services/tinyProductService');
const { analisarPedidoViaIA } = require('../services/openaiMarcaService');
const { enviarOrdemCompra } = require('../services/enviarOrdem');
const { listarFornecedoresPadronizados } = require('../services/tinyFornecedorService');

function normalizarTexto(txt) {
  return txt
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .trim();
}

router.post('/', async (req, res) => {
  try {
    const pedido = req.body;
    if (!pedido || !pedido.itens || !pedido.itens.length) {
      return res.status(400).json({ erro: 'Pedido inválido ou sem itens.' });
    }

    const fornecedores = await listarFornecedoresPadronizados();
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

      const marca = produto.marca?.nome?.trim();
      if (!marca) {
        resultados.push({ produtoSKU: sku, status: 'marca ausente' });
        continue;
      }

      const marcaNormalizada = normalizarTexto(marca);
      const nomePadrao = `fornecedor ${marcaNormalizada}`;

      const fornecedorMatch = fornecedores.find(f =>
        normalizarTexto(f.nome).includes(nomePadrao)
      );

      if (fornecedorMatch) {
        console.log('✅ Match direto encontrado:', fornecedorMatch.nome);
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
        continue;
      }

      const fornecedoresFiltrados = fornecedores.filter(f =>
        normalizarTexto(f.nome).includes(marcaNormalizada)
      );

      console.log('🔍 Marca identificada:', marca);
      console.log('🧠 Fornecedores entregues à IA:', fornecedoresFiltrados.map(f => f.nome));

      const respostaIA = await analisarPedidoViaIA(
        { produto, quantidade, valorUnitario, marca },
        fornecedoresFiltrados
      );

      const itemIA = respostaIA?.itens?.[0];
      if (!itemIA) {
        resultados.push({ produtoSKU: sku, status: 'resposta inválida da IA' });
        continue;
      }

      if (!itemIA.idFornecedor) {
        resultados.push({
          produtoSKU: sku,
          status: 'IA não encontrou fornecedor compatível',
          motivo: itemIA?.motivo || 'não especificado'
        });
        continue;
      }

      if (itemIA.deveGerarOC) {
        console.log('📤 Enviando OC com dados:', {
          produtoId,
          quantidade,
          valorUnitario,
          idFornecedor: itemIA.idFornecedor
        });

        const respostaOC = await enviarOrdemCompra({
          produtoId,
          quantidade,
          valorUnitario,
          idFornecedor: itemIA.idFornecedor
        });

        console.log('📥 Resposta da Tiny:', respostaOC);

        resultados.push({
          produtoSKU: sku,
          fornecedor: itemIA.nomeFornecedor,
          ocCriada: true,
          ocInfo: respostaOC || null
        });
      } else {
        resultados.push({
          produtoSKU: sku,
          fornecedor: itemIA.nomeFornecedor,
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
