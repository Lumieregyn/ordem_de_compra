const express = require('express');
const router = express.Router();

const { getProdutoFromTinyV3 } = require('../services/tinyProductService');
const { getAccessToken } = require('../services/tokenService');
const { analisarPedidoViaIA } = require('../services/openaiMarcaService');
const { enviarOrdemCompra } = require('../services/enviarOrdem');
const { gerarPayloadOrdemCompra } = require('../services/gerarPayloadOC');
const { getPedidoCompletoById } = require('../services/tinyPedidoService');
const { listarTodosFornecedores } = require('../services/tinyFornecedorService');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const pedidosProcessados = new Set();

function normalizarTexto(txt) {
  return txt?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().trim();
}

function filtrarItensNecessarios(itens) {
  return itens.filter(item => item.produto?.sku?.toUpperCase().includes('PEDIDO'));
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
      console.warn('❌ Webhook sem ID ou número de pedido válido');
      return res.status(200).json({ mensagem: 'Webhook ignorado: dados incompletos.' });
    }

    if (pedidosProcessados.has(idPedido)) {
      console.warn(`⏩ Pedido ID ${idPedido} já processado anteriormente. Ignorando duplicado.`);
      return res.status(200).json({ mensagem: 'Pedido já processado anteriormente.' });
    }

    const token = await getAccessToken();
    if (!token) {
      console.error('❌ Token de acesso não disponível. Abandonando fluxo.');
      return res.status(500).json({ erro: 'Token indisponível.' });
    }

    const pedido = await getPedidoCompletoById(idPedido);
    const numeroPedido = pedido?.numeroPedido || '[sem número]';

    if (!pedido || !pedido.id || !pedido.numeroPedido || pedido.situacao === undefined) {
      console.warn(`⚠️ Pedido ${numeroPedido} carregado sem campos essenciais.`);
      return res.status(200).json({ mensagem: 'Pedido com dados incompletos. Ignorado.' });
    }

    const dataPedido = new Date(pedido.dataPedido || pedido.data || '');
    const hoje = new Date();
    const diffDias = Math.floor((hoje - dataPedido) / (1000 * 60 * 60 * 24));
    if (diffDias > 30) {
      console.log(`🛑 Pedido ${numeroPedido} ignorado. Data muito antiga (${diffDias} dias atrás).`);
      return res.status(200).json({ mensagem: 'Pedido antigo demais. Ignorado.' });
    }

    if (pedido.situacao !== 3) {
      console.log(`🛑 Pedido ${numeroPedido} ignorado. Situação atual: ${pedido.situacao}`);
      return res.status(200).json({ mensagem: `Pedido ${numeroPedido} com situação ${pedido.situacao} não será processado.` });
    }

    pedidosProcessados.add(idPedido);

    const itensFiltrados = filtrarItensNecessarios(pedido.itens);
    if (itensFiltrados.length === 0) {
      console.log(`🛑 Pedido ${numeroPedido} sem itens sob encomenda (SKU com "PEDIDO")`);
      return res.status(200).json({ mensagem: 'Nenhuma OC será gerada. Itens são de estoque.' });
    }

    const todos = await listarTodosFornecedores();
    const fornecedoresDiretos = todos.filter(f => f.nomeOriginal.toUpperCase().startsWith('FORNECEDOR '));
    const fornecedoresIA = todos.filter(f => !f.nomeOriginal.toUpperCase().startsWith('FORNECEDOR '));

    const itensEnriquecidos = [];

    for (const item of itensFiltrados) {
      try {
        const produtoId = item.produto?.id;
        const quantidade = item.quantidade || 1;
        const valorUnitario = item.valorUnitario || item.valor_unitario || 0;

        if (!produtoId) continue;

        console.log(`🔍 Buscando produto ${produtoId}`);
        let produto = await getProdutoFromTinyV3(produtoId);

        if (!produto) {
          console.warn(`⚠️ Retentando produto ID ${produtoId}...`);
          await delay(3000);
          produto = await getProdutoFromTinyV3(produtoId);
        }

        if (!produto) continue;

        const sku = produto.sku || produto.codigo || 'DESCONHECIDO';
        const marca = produto.marca?.nome?.trim();
        if (!marca) continue;

        itensEnriquecidos.push({ ...item, produto, sku, quantidade, valorUnitario, marca });
        await delay(250);
      } catch (erroProduto) {
        console.error(`❌ Erro ao buscar produto do item:`, erroProduto);
      }
    }

    const agrupadosPorMarca = agruparItensPorMarca(itensEnriquecidos);
    const resultados = [];

    for (const [marca, itensDaMarca] of Object.entries(agrupadosPorMarca)) {
      try {
        const marcaNorm = normalizarTexto(marca);
        let fornecedor = fornecedoresDiretos.find(f => f.nomeNormalizado === `fornecedor ${marcaNorm}`)
          || fornecedoresDiretos.find(f => f.nomeNormalizado.includes(marcaNorm));

        if (!fornecedor && fornecedoresIA.length > 0) {
          const pedidoContexto = {
            marca,
            produtoSKU: itensDaMarca[0]?.sku || '',
            quantidade: itensDaMarca[0]?.quantidade || 1,
            valorUnitario: itensDaMarca[0]?.valorUnitario || 0,
            produto: itensDaMarca[0]?.produto || {}
          };

          console.log('🤖 IA - Enviando prompt...');
          const respostaIA = await analisarPedidoViaIA(pedidoContexto, fornecedoresIA);

          if (respostaIA?.itens?.[0]?.deveGerarOC && respostaIA.itens?.[0]?.idFornecedor) {
            fornecedor = todos.find(f => f.id === respostaIA.itens[0].idFornecedor);
          }
        }

        if (!fornecedor) {
          console.warn(`⚠️ Nenhum fornecedor identificado para marca ${marca}.`);
          continue;
        }

        console.log(`🧾 Gerando payload para marca ${marca}`);
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

        console.log(`🚚 Enviando OC para fornecedor ${fornecedor.nomeOriginal}`);
        const resposta = await enviarOrdemCompra(payloadOC);
        resultados.push({ marca, fornecedor: fornecedor.nomeOriginal, status: resposta });

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
