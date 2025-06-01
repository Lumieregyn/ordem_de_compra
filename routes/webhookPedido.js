const express = require('express');
const router = express.Router();

const { getProdutoFromTinyV3 } = require('../services/tinyProductService');
const { getAccessToken } = require('../services/tokenService');
const { analisarPedidoViaIA } = require('../services/openaiMarcaService');
const { enviarOrdemCompraV3 } = require('../services/enviarOrdemCompraV3'); // Bloco 5 real
const { gerarPayloadOrdemCompra } = require('../services/gerarPayloadOC'); // ✅ Bloco 4
const { getPedidoCompletoById } = require('../services/tinyPedidoService');
const axios = require('axios');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';
const MAX_PAGINAS = 100;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizarTexto(txt) {
  return txt?.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().trim();
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
      await delay(300);
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

    if (!idPedido || !numeroPedido) {
      console.warn('❌ Webhook sem ID ou número de pedido válido');
      return;
    }

    const pedido = await getPedidoCompletoById(idPedido);
    if (!pedido?.itens?.length) return;

    const fornecedores = await listarTodosFornecedores();
    const resultados = [];

    for (const item of pedido.itens) {
      const produtoId = item.produto?.id;
      if (!produtoId) continue;

      const produto = await getProdutoFromTinyV3(produtoId);
      if (!produto) continue;

      const sku = produto.sku || 'DESCONHECIDO';
      const marca = produto.marca?.nome?.trim();
      if (!marca) continue;

      const marcaNormalizada = normalizarTexto(marca);
      const nomePadrao = `FORNECEDOR ${marcaNormalizada}`;

      const fornecedorMatchDireto = fornecedores.find(f =>
        normalizarTexto(f.nome).includes(normalizarTexto(nomePadrao))
      );

      let fornecedorSelecionado = fornecedorMatchDireto;
      if (!fornecedorSelecionado) {
        const fornecedoresFiltrados = fornecedores.filter(f =>
          normalizarTexto(f.nome).includes(marcaNormalizada) ||
          marcaNormalizada.includes(normalizarTexto(f.nome))
        );

        const respostaIA = await analisarPedidoViaIA({
          produto,
          quantidade: item.quantidade,
          valorUnitario: item.valorUnitario,
          marca
        }, fornecedoresFiltrados);

        const itemIA = respostaIA?.itens?.[0];
        if (itemIA?.deveGerarOC && itemIA?.idFornecedor) {
          fornecedorSelecionado = fornecedores.find(f => f.id === itemIA.idFornecedor);
        } else {
          continue;
        }
      }

      if (fornecedorSelecionado) {
        const payloadOC = gerarPayloadOrdemCompra({
          origem: pedido.origem || 'comercial',
          dataPedido: pedido.data || new Date().toISOString().split('T')[0],
          dataPrevista: pedido.dataPrevista,
          estimativaEntrega: 7, // ou extrair das observações se desejar
          condicaoPagamento: pedido.condicao || "A prazo 30 dias",
          parcelas: pedido.parcelas || [],
          vendedor: { nome: pedido?.vendedor?.nome || 'Desconhecido' },
          pedidoNumero: numeroPedido,
          contatoId: fornecedorSelecionado.id,
          produto: {
            id: produto.id,
            sku: produto.sku,
            quantidade: item.quantidade || 1,
            valor: item.valorUnitario || 0
          },
          fornecedor: {
            id: fornecedorSelecionado.id,
            nome: fornecedorSelecionado.nome
          }
        });

        const resposta = await enviarOrdemCompraV3(payloadOC);
        resultados.push({ sku, fornecedor: fornecedorSelecionado.nome, status: resposta });
      }
    }
  } catch (err) {
    console.error('❌ Erro geral no webhook:', err.message || err);
  }
});

module.exports = router;
