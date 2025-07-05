const express = require('express');
const router = express.Router();

const { getProdutoFromTinyV3 } = require('../services/tinyProductService');
const { getAccessToken } = require('../services/tokenService');
const { enviarOrdemCompra } = require('../services/enviarOrdem');
const { gerarPayloadOrdemCompra } = require('../services/gerarPayloadOC');
const { getPedidoCompletoById } = require('../services/tinyPedidoService');
const { listarTodosFornecedores } = require('../services/tinyFornecedorService');
const { selecionarFornecedor } = require('../services/selecionarFornecedor');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const pedidosProcessados = new Set();

function filtrarItensNecessarios(itens) {
  return itens.filter(item =>
    item.produto?.sku?.toUpperCase().includes('PEDIDO')
  );
}

function agruparItensPorMarca(itensComMarca) {
  const grupos = {};
  for (const item of itensComMarca) {
    const marca = item.marca || 'DESCONHECIDA';
    if (!grupos[marca]) grupos[marca] = [];
    grupos[marca].push(item);
  }
  return grupos;
}

router.post('/', async (req, res) => {
  try {
    const idPedido = req.body?.dados?.id;
    const numeroRecebido = req.body?.dados?.numero;

    console.log(`📥 Webhook recebido: ID ${idPedido}, Número ${numeroRecebido}`);

    if (!idPedido || !numeroRecebido) {
      return res.status(200).json({ mensagem: 'Webhook ignorado: dados incompletos.' });
    }

    if (pedidosProcessados.has(idPedido)) {
      return res.status(200).json({ mensagem: 'Pedido já processado anteriormente.' });
    }

    const token = await getAccessToken();
    if (!token) return res.status(500).json({ erro: 'Token indisponível.' });

    const pedido = await getPedidoCompletoById(idPedido);
    const numeroPedido = pedido?.numeroPedido || '[sem número]';

    if (!pedido || !pedido.id || !pedido.numeroPedido || pedido.situacao === undefined) {
      return res.status(200).json({ mensagem: 'Pedido com dados incompletos. Ignorado.' });
    }

    const dataPedido = new Date(pedido.dataPedido || pedido.data || '');
    const hoje = new Date();
    const diffDias = Math.floor((hoje - dataPedido) / (1000 * 60 * 60 * 24));
    if (diffDias > 30) {
      return res.status(200).json({ mensagem: 'Pedido antigo demais. Ignorado.' });
    }

    if (pedido.situacao !== 3) {
      return res.status(200).json({
        mensagem: `Pedido ${numeroPedido} com situação ${pedido.situacao} não será processado.`
      });
    }

    pedidosProcessados.add(idPedido);

    const itensFiltrados = filtrarItensNecessarios(pedido.itens);
    if (itensFiltrados.length === 0) {
      return res.status(200).json({ mensagem: 'Nenhuma OC será gerada. Itens são de estoque.' });
    }

    const fornecedores = await listarTodosFornecedores();
    const itensEnriquecidos = [];

    for (const item of itensFiltrados) {
      try {
        const produtoId = item.produto?.id;
        const quantidade = item.quantidade || 1;
        const valorUnitario = item.valorUnitario || item.valor_unitario || 0;

        if (!produtoId) continue;

        let produto = await getProdutoFromTinyV3(produtoId);
        if (!produto) {
          await delay(3000);
          produto = await getProdutoFromTinyV3(produtoId);
        }
        if (!produto) continue;

        const sku = produto.sku || produto.codigo || 'DESCONHECIDO';
        const marca = produto.marca?.nome?.trim();
        if (!marca) continue;

        itensEnriquecidos.push({
          ...item,
          produto,
          sku,
          quantidade,
          valorUnitario,
          marca
        });
        await delay(250);
      } catch (erroProduto) {
        console.error(`❌ Erro ao buscar produto do item:`, erroProduto);
      }
    }

    const agrupadosPorMarca = agruparItensPorMarca(itensEnriquecidos);
    const resultados = [];

    for (const [marca, itensDaMarca] of Object.entries(agrupadosPorMarca)) {
      try {
        const sku = itensDaMarca[0]?.sku || '';
        const fornecedor = await selecionarFornecedor(marca, sku, fornecedores);

        if (!fornecedor) {
          console.warn(`⚠️ Nenhum fornecedor identificado para marca ${marca}`);
          continue;
        }

        const payloadOC = gerarPayloadOrdemCompra({
          numeroPedido: pedido.numeroPedido,
          nomeCliente: pedido.cliente?.nome || '',
          dataPrevista: pedido.dataPrevista,
          itens: itensDaMarca,
          fornecedor
        });

        if (!payloadOC || !payloadOC.itens?.length) {
          console.warn(`❌ Payload inválido para OC da marca ${marca}.`);
          continue;
        }

        console.log(`🚚 Enviando OC para fornecedor ${fornecedor.nomeOriginal || fornecedor.nome}`);
        const resposta = await enviarOrdemCompra(payloadOC);
        resultados.push({
          marca,
          fornecedor: fornecedor.nomeOriginal || fornecedor.nome,
          status: resposta
        });

      } catch (erroItem) {
        console.error(`❌ Erro ao processar grupo da marca ${marca}:`, erroItem);
      }
    }

    console.log(`📦 Resultado final:\n`, resultados);
    return res.status(200).json({ mensagem: 'OC(s) processada(s)', resultados });

  } catch (err) {
    console.error('❌ Erro geral no webhook:', err);
    return res.status(500).json({ erro: 'Erro interno no processamento do webhook.' });
  }
});

module.exports = router;
