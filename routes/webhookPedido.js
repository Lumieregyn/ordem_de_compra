const express = require('express');
const router = express.Router();

const { getProdutoFromTinyV3 } = require('../services/tinyProductService');
const { getAccessToken } = require('../services/tokenService');
const { analisarPedidoViaIA } = require('../services/openaiMarcaService');
const { enviarOrdemCompra } = require('../services/enviarOrdem');
const { gerarPayloadOrdemCompra } = require('../services/gerarPayloadOC');
const { getPedidoCompletoById } = require('../services/tinyPedidoService');
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
  res.status(200).send('Webhook recebido ✅');

  try {
    const idPedido = req.body?.dados?.id;
    const numeroPedido = req.body?.dados?.numero;

    console.log(`📥 Webhook recebido: ID ${idPedido}, Número ${numeroPedido}`);

    if (!idPedido || !numeroPedido) {
      console.warn('❌ Webhook sem ID ou número de pedido válido');
      return;
    }

    if (pedidosProcessados.has(idPedido)) {
      console.warn(`⏩ Pedido ID ${idPedido} já processado anteriormente. Ignorando duplicado.`);
      return;
    }
    pedidosProcessados.add(idPedido);

    const token = await getAccessToken();
    if (!token) {
      console.error('❌ Token de acesso não disponível. Abandonando fluxo.');
      return;
    }

    const pedido = await getPedidoCompletoById(idPedido);
    if (!pedido || !pedido.id || !pedido.numeroPedido) {
      console.warn(`⚠️ Dados incompletos do pedido retornado. ID: ${idPedido}`);
      return;
    }

    // ✅ VERIFICA STATUS
    if (pedido.status?.toUpperCase() !== 'APROVADO') {
      console.log(`🛑 Pedido ${pedido.numeroPedido} ignorado. Status atual: ${pedido.status}`);
      return res.status(200).json({
        mensagem: `Pedido ${pedido.numeroPedido} com status "${pedido.status}" não será processado para OC.`
      });
    }

    // ✅ VALIDA ITENS
    const itensFiltrados = filtrarItensNecessarios(pedido.itens);
    if (itensFiltrados.length === 0) {
      console.log(`🛑 Pedido ${pedido.numeroPedido} não contém itens sob encomenda (com "PEDIDO" no SKU).`);
      return res.status(200).json({
        mensagem: 'Todos os itens são de estoque. Nenhuma OC será gerada.'
      });
    }

    const fornecedores = await listarTodosFornecedores();
    const resultados = [];

    for (const item of itensFiltrados) {
      const produtoId = item.produto?.id;
      const quantidade = item.quantidade || 1;
      const valorUnitario = item.valorUnitario || item.valor_unitario || 0;

      if (!produtoId) {
        console.warn(`⚠️ Item sem produtoId. Ignorando.`);
        continue;
      }

      const produto = await getProdutoFromTinyV3(produtoId);
      if (!produto) {
        console.warn(`⚠️ Produto ID ${produtoId} não encontrado. Ignorando.`);
        continue;
      }

      const sku = produto.sku || produto.codigo || 'DESCONHECIDO';
      const marca = produto.marca?.nome?.trim();
      if (!marca) {
        console.warn(`⚠️ Produto SKU ${sku} sem marca. Ignorando.`);
        continue;
      }

      const marcaNormalizada = normalizarTexto(marca);
      let fornecedorSelecionado = fornecedores.find(f =>
        normalizarTexto(f.nome) === `fornecedor ${marcaNormalizada}`
      ) || fornecedores.find(f =>
        normalizarTexto(f.nome).includes(marcaNormalizada)
      );

      if (!fornecedorSelecionado) {
        const respostaIA = await analisarPedidoViaIA({ produtoSKU: sku, marca, fornecedores });
        if (respostaIA?.deveGerarOC && respostaIA?.idFornecedor) {
          fornecedorSelecionado = fornecedores.find(f => f.id === respostaIA.idFornecedor);
        } else {
          console.warn(`⚠️ IA não encontrou fornecedor para SKU ${sku}`);
          continue;
        }
      }

      const camposObrigatorios = {
        produtoId: produto.id,
        quantidade,
        valorUnitario,
        sku,
        idFornecedor: fornecedorSelecionado?.id,
        nomeFornecedor: fornecedorSelecionado?.nome,
        pedido,
        produto
      };

      const camposFaltando = Object.entries(camposObrigatorios)
        .filter(([_, v]) => !v)
        .map(([k]) => k);

      if (camposFaltando.length) {
        console.warn(`❌ Pedido ${numeroPedido} – Campos ausentes para SKU ${sku}:`, camposFaltando);
        continue;
      }

      const payloadOC = gerarPayloadOrdemCompra({
        pedido,
        produto,
        sku,
        quantidade,
        valorUnitario,
        idFornecedor: fornecedorSelecionado.id
      });

      if (!payloadOC || typeof payloadOC !== 'object' || !payloadOC.itens?.length) {
        console.warn(`❌ Payload da OC inválido para SKU ${sku}.`);
        continue;
      }

      const resposta = await enviarOrdemCompra(payloadOC);
      resultados.push({ sku, fornecedor: fornecedorSelecionado.nome, status: resposta });
    }

    console.log(`📦 Resultado final:\n`, resultados);
  } catch (err) {
    console.error('❌ Erro geral no webhook:', err.message || err);
  }
});

module.exports = router;
