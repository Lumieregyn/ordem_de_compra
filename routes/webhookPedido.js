const express = require('express');
const router = express.Router();

const { getProdutoFromTinyV3 } = require('../services/tinyProductService');
const { getAccessToken } = require('../services/tokenService');
const { analisarPedidoViaIA } = require('../services/openaiMarcaService');
const { enviarOrdemCompra } = require('../services/enviarOrdem');
const { gerarPayloadOrdemCompra } = require('../services/gerarPayloadOC');
const { getPedidoCompletoById } = require('../services/tinyPedidoService');
const { validarRespostaOrdem } = require('../services/validarRespostaOrdemService');
const { enviarWhatsappErro } = require('../services/whatsAppService');
const axios = require('axios');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const pedidosProcessados = new Set();
const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';
const MAX_PAGINAS = 10;

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

async function listarTodosFornecedores() {
  const token = await getAccessToken();
  if (!token) return [];

  const todos = [];
  let page = 1;
  const limit = 50;

  try {
    while (page <= MAX_PAGINAS) {
      const response = await axios.get(`${TINY_API_V3_BASE}/contatos?tipo=J&nome=FORNECEDOR&page=${page}&limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const contatosPagina = response.data.itens || [];
      if (!contatosPagina.length) break;

      todos.push(...contatosPagina);
      page++;
      await delay(500);
    }

    return Array.from(new Map(todos.map(f => [f.id, f])).values());
  } catch (err) {
    console.error('❌ Erro ao buscar fornecedores:', err.message);
    return [];
  }
}

router.post('/', async (req, res) => {
  try {
    const idPedido = req.body?.dados?.id;
    const numeroRecebido = req.body?.dados?.numero;

    if (!idPedido || !numeroRecebido) {
      await enviarWhatsappErro(`🚨 Pedido ignorado - dados incompletos\nID: ${idPedido}\nNúmero: ${numeroRecebido || '[vazio]'}`);
      return res.status(200).json({ mensagem: 'Webhook ignorado: dados incompletos.' });
    }

    if (pedidosProcessados.has(idPedido)) {
      return res.status(200).json({ mensagem: 'Pedido já processado anteriormente.' });
    }

    const token = await getAccessToken();
    if (!token) {
      await enviarWhatsappErro(`🚨 Token indisponível para pedido ${numeroRecebido}`);
      return res.status(500).json({ erro: 'Token indisponível.' });
    }

    const pedido = await getPedidoCompletoById(idPedido);
    const numeroPedido = pedido?.numeroPedido || '[sem número]';

    if (!pedido || !pedido.id || !pedido.numeroPedido || pedido.situacao === undefined) {
      await enviarWhatsappErro(`🚨 Pedido ${numeroPedido} inválido\nMotivo: Dados ausentes ou incompletos`);
      return res.status(200).json({ mensagem: 'Pedido com dados incompletos. Ignorado.' });
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

        const produto = await getProdutoFromTinyV3(produtoId);
        if (!produto) continue;

        const sku = produto.sku || produto.codigo || 'DESCONHECIDO';
        const marca = produto.marca?.nome?.trim();
        if (!marca) continue;

        itensEnriquecidos.push({ ...item, produto, sku, quantidade, valorUnitario, marca });
      } catch (erroProduto) {
        console.error(`❌ Erro ao buscar produto do item:`, erroProduto);
      }
    }

    const agrupadosPorMarca = agruparItensPorMarca(itensEnriquecidos);
    const resultados = [];

    for (const [marca, itensDaMarca] of Object.entries(agrupadosPorMarca)) {
      try {
        const marcaNorm = normalizarTexto(marca);
        let fornecedor = fornecedores.find(f => normalizarTexto(f.nome) === `fornecedor ${marcaNorm}`)
          || fornecedores.find(f => normalizarTexto(f.nome).includes(marcaNorm));

        if (!fornecedor) {
          const respostaIA = await analisarPedidoViaIA({ marca, produtoSKU: itensDaMarca[0].sku, fornecedores });
          if (respostaIA?.deveGerarOC && respostaIA.idFornecedor) {
            fornecedor = fornecedores.find(f => f.id === respostaIA.idFornecedor);
          }
        }

        if (!fornecedor) {
          const skus = itensDaMarca.map(i => i.sku).join(', ');
          await enviarWhatsappErro(`🚨 Ordem de Compra não criada\nPedido: ${numeroPedido}\nMarca: ${marca}\nSKUs: ${skus}\n⚠️ Nenhum fornecedor identificado\n\nFavor ajustar o fornecedor e gerar a OC manualmente.`);
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
          await enviarWhatsappErro(`🚨 Payload inválido para OC\nPedido: ${numeroPedido}\nMarca: ${marca}`);
          continue;
        }

        const resposta = await enviarOrdemCompra(payloadOC);

        await validarRespostaOrdem(resposta, numeroPedido, marca, fornecedor);

        resultados.push({ marca, fornecedor: fornecedor.nome, status: 'Processado' });

      } catch (erroItem) {
        await enviarWhatsappErro(`❌ Erro ao processar marca ${marca} no pedido ${numeroPedido}\n${erroItem.message}`);
      }
    }

    return res.status(200).json({ mensagem: 'OC(s) processada(s)', resultados });

  } catch (err) {
    await enviarWhatsappErro(`❌ Erro geral ao processar webhook: ${err.message}`);
    return res.status(500).json({ erro: 'Erro interno no processamento do webhook.' });
  }
});

module.exports = router;
