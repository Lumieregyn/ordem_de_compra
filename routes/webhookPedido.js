// routes/webhookPedido.js - Versão ajustada (listagem V3, guardrail e match robusto)

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
const MAX_PAGINAS = 10;

function normalizarTexto(txt) {
  return String(txt || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase().trim();
}

function filtrarItensNecessarios(itens) {
  return (Array.isArray(itens) ? itens : []).filter(item =>
    String(item?.produto?.sku || '').toUpperCase().includes('PEDIDO')
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

// ===== Listagem de fornecedores (V3) com paginação correta e parser tolerante =====
async function listarTodosFornecedores() {
  const token = await getAccessToken();
  if (!token) return [];

  const todos = [];
  let pagina = 1;
  const tamanhoPagina = 50;

  try {
    while (pagina <= MAX_PAGINAS) {
      const resp = await axios.get(`${TINY_API_V3_BASE}/contatos`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { pagina, tamanhoPagina, tipo: 'J', nome: 'FORNECEDOR' } // padrão V3
      });

      const payload = resp.data || {};
      const itens =
        payload?.itens ||
        payload?.data?.itens ||
        payload?.data ||
        payload?.contacts ||
        [];

      const lista = Array.isArray(itens) ? itens : [];
      if (lista.length === 0) break;

      todos.push(...lista);
      pagina++;

      await delay(500);
    }

    // dedup por id
    return Array.from(new Map(todos.map(f => [String(f.id ?? f.codigo ?? f.idCadastro), f])).values());
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

    // ===== carrega fornecedores =====
    const fornecedores = await listarTodosFornecedores();

    // 🚧 Guardrail: sem fornecedores → não chama IA nem tenta OC
    if (!Array.isArray(fornecedores) || fornecedores.length === 0) {
      try {
        await validarRespostaOrdem(
          { retorno: { mensagem: 'Lista de fornecedores vazia (V3)', detalhes: `PEDIDO ${numeroPedido}` } },
          numeroPedido,
          'N/D',
          null
        );
      } catch {}
      return res.status(200).json({ mensagem: `Pedido ${numeroPedido}: lista de fornecedores vazia. Ignorado.` });
    }

    const itensEnriquecidos = [];

    for (const item of itensFiltrados) {
      try {
        const produtoId = item?.produto?.id;
        const quantidade = item?.quantidade ?? 1;
        const valorUnitario = item?.valorUnitario ?? item?.valor_unitario ?? 0;

        if (!produtoId) continue;

        const produto = await getProdutoFromTinyV3(produtoId);
        if (!produto) continue;

        const sku = produto.sku || produto.codigo || 'DESCONHECIDO';
        const marca = produto?.marca?.nome?.trim();
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
      const alvoExato = normalizarTexto(`FORNECEDOR ${marca}`);

      let fornecedor =
        fornecedores.find(f => normalizarTexto(f?.nome) === alvoExato) ||
        fornecedores.find(f => {
          const nome = normalizarTexto(f?.nome || '').replace(/^fornecedor/, '').trim();
          return nome.includes(marcaNorm) || marcaNorm.includes(nome);
        });

      // Fluxo de IA para escolher fornecedor (
