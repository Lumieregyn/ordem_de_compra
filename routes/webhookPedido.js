// routes/webhookPedido.js - Versão limpa, WhatsApp só via IA do validarRespostaOrdem.js

const express = require('express');
const router = express.Router();

const { getProdutoFromTinyV3 } = require('../services/tinyProductService');
const { getAccessToken } = require('../services/tokenService');
const { analisarPedidoViaIA } = require('../services/openaiMarcaService');
const { enviarOrdemCompra } = require('../services/enviarOrdem');
const { gerarPayloadOrdemCompra } = require('../services/gerarPayloadOC');
const { getPedidoCompletoById } = require('../services/tinyPedidoService');
const { validarRespostaOrdem } = require('../services/validarRespostaOrdemService');
const axios = require('axios');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const pedidosProcessados = new Set();
const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';
const MAX_PAGINAS = 30;

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

    // Não dispara WhatsApp aqui! Apenas log ou status HTTP:
    if (!idPedido || !numeroRecebido) {
      return res.status(200).json({ mensagem: 'Webhook ignorado: dados incompletos.' });
    }

    if (pedidosProcessados.has(idPedido)) {
      return res.status(200).json({ mensagem: 'Pedido já processado anteriormente.' });
    }

    const token = await getAccessToken();
    if (!token) {
      return res.status(500).json({ erro: 'Token indisponível.' });
    }

    const pedido = await getPedidoCompletoById(idPedido);
    const numeroPedido = pedido?.numeroPedido || '[sem número]';

    if (!pedido || !pedido.id || !pedido.numeroPedido || pedido.situacao === undefined) {
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
      const marcaNorm = normalizarTexto(marca);
      let fornecedor = fornecedores.find(f => normalizarTexto(f.nome) === `fornecedor ${marcaNorm}`)
        || fornecedores.find(f => normalizarTexto(f.nome).includes(marcaNorm));

      // Fluxo de IA para escolher fornecedor (mantido)
      if (!fornecedor) {
        const respostaIA = await analisarPedidoViaIA({ marca, produtoSKU: itensDaMarca[0].sku, fornecedores });
        if (respostaIA?.deveGerarOC && respostaIA.idFornecedor) {
          fornecedor = fornecedores.find(f => f.id === respostaIA.idFornecedor);
        }
      }

      // ⚠️ Aqui ÚNICO caso onde WhatsApp pode ser disparado antes da OC:
      if (!fornecedor) {
        const skus = itensDaMarca.map(i => i.sku).join(', ');
        await validarRespostaOrdem(
          { retorno: { mensagem: 'Nenhum fornecedor identificado', detalhes: skus } },
          numeroPedido,
          marca,
          null
        );
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
        continue; // Simplesmente ignora payload inválido
      }

      try {
        const resposta = await enviarOrdemCompra(payloadOC);
        const sucesso = await validarRespostaOrdem(resposta, numeroPedido, marca, fornecedor);

        resultados.push({ marca, fornecedor: fornecedor.nome, status: sucesso ? 'OK' : 'Falha' });
      } catch (erroEnvio) {
        // Se falhar mesmo assim, não dispara WhatsApp aqui!
        console.error(`❌ Erro ao enviar OC da marca ${marca} no pedido ${numeroPedido}`, erroEnvio);
      }
    }

    return res.status(200).json({ mensagem: 'OC(s) processada(s)', resultados });

  } catch (err) {
    // Erros genéricos: só log, sem WhatsApp
    console.error('❌ Erro geral ao processar webhook:', err);
    return res.status(500).json({ erro: 'Erro interno no processamento do webhook.' });
  }
});

module.exports = router;
