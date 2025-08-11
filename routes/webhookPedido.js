const express = require('express');
const router = express.Router();

const { getProdutoFromTinyV3 } = require('../services/tinyProductService');
const { getAccessToken } = require('../services/tokenService');
const { analisarPedidoViaIA } = require('../services/openaiMarcaService');
const { enviarOrdemCompra } = require('../services/enviarOrdem');
const { gerarPayloadOrdemCompra } = require('../services/gerarPayloadOC');
const { getPedidoCompletoById } = require('../services/tinyPedidoService');
const axios = require('axios');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';
// const MAX_PAGINAS = 10;  // ❌ removido: vamos até o fim

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const pedidosProcessados = new Set();

function normalizarTexto(txt) {
  return txt?.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().trim();
}

/**
 * ✅ AJUSTE CIRÚRGICO: Listagem completa dos fornecedores (V3)
 * - pagina até acabar (sem teto artificial)
 * - limit=100 para reduzir chamadas
 * - retry leve p/ 429/5xx/timeout
 * - dedupe por id
 */
async function listarTodosFornecedores() {
  const token = await getAccessToken();
  if (!token) return [];

  const todos = [];
  let page = 1;
  const limit = 100;
  const TIMEOUT_MS = 15000;
  const MAX_RETRY = 3;

  while (true) {
    let tentativa = 0;
    let paginaOk = false;

    while (!paginaOk && tentativa < MAX_RETRY) {
      tentativa++;
      try {
        const response = await axios.get(`${TINY_API_V3_BASE}/contatos`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { tipo: 'J', nome: 'FORNECEDOR', page, limit },
          timeout: TIMEOUT_MS,
          validateStatus: () => true,
        });

        const contatosPagina = response.data?.itens || [];
        if (!Array.isArray(contatosPagina) || contatosPagina.length === 0) {
          // fim da paginação
          return Array.from(new Map(todos.map(f => [f.id, f])).values());
        }

        todos.push(...contatosPagina);
        paginaOk = true;
      } catch (err) {
        const status = err.response?.status;
        const elegivelRetry = status === 429 || (status >= 500) || err.code === 'ECONNABORTED';
        if (!elegivelRetry || tentativa >= MAX_RETRY) {
          console.error('❌ Erro ao buscar fornecedores:', status, err.message);
          // retorna o que já coletou
          return Array.from(new Map(todos.map(f => [f.id, f])).values());
        }
        // backoff exponencial simples
        await delay(800 * Math.pow(2, tentativa - 1));
      }
    }

    page++;
    await delay(400); // pequeno respiro entre páginas
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

    console.log(`📡 Buscando pedido completo via API V3: ID ${idPedido}...`);
    const pedido = await getPedidoCompletoById(idPedido);

    if (!pedido || !pedido.id || !pedido.numeroPedido) {
      console.warn(`⚠️ Dados incompletos do pedido retornado. ID: ${idPedido}`);
      return;
    }

    if (!pedido.itens || !Array.isArray(pedido.itens) || pedido.itens.length === 0) {
      console.warn(`⚠️ Pedido ${numeroPedido} retornado sem itens. Ignorando.`);
      return;
    }

    console.log(`📄 Pedido completo recebido:\n`, JSON.stringify(pedido, null, 2));

    const fornecedores = await listarTodosFornecedores();
    const resultados = [];

    for (const item of pedido.itens) {
      const produtoId = item.produto?.id;
      if (!produtoId) continue;

      const produto = await getProdutoFromTinyV3(produtoId);
      if (!produto) continue;

      const sku = produto.sku || produto.codigo || 'DESCONHECIDO';
      const marca = produto.marca?.nome?.trim();
      if (!marca) continue;

      const marcaNormalizada = normalizarTexto(marca);
      const nomePadrao = `FORNECEDOR ${marcaNormalizada}`;
      let fornecedorSelecionado = fornecedores.find(f =>
        normalizarTexto(f.nome) === nomePadrao
      );

      if (!fornecedorSelecionado) {
        fornecedorSelecionado = fornecedores.find(f =>
          normalizarTexto(f.nome).includes(marcaNormalizada) ||
          marcaNormalizada.includes(normalizarTexto(f.nome).replace('fornecedor', '').trim())
        );
      }

      if (!fornecedorSelecionado) {
        const respostaIA = await analisarPedidoViaIA({
          produtoSKU: sku,
          marca,
          fornecedores
        });

        if (respostaIA?.deveGerarOC && typeof respostaIA?.idFornecedor === 'number') {
          fornecedorSelecionado = fornecedores.find(f => f.id === respostaIA.idFornecedor);
        } else {
          console.warn(`⚠️ Pedido ${numeroPedido} – IA não encontrou fornecedor para SKU ${sku}`);
          continue;
        }
      }

      const dadosParaOC = {
        produtoId: produto.id,
        quantidade: item.quantidade || 1,
        valorUnitario: item.valorUnitario || item.valor_unitario || 0,
        sku,
        idFornecedor: fornecedorSelecionado?.id,
        nomeFornecedor: fornecedorSelecionado?.nome,
        pedido,
        produto
      };

      const obrigatorios = [
        'produtoId',
        'quantidade',
        'valorUnitario',
        'sku',
        'idFornecedor',
        'nomeFornecedor',
        'pedido',
        'produto'
      ];

      const faltando = obrigatorios.filter(c => !dadosParaOC[c]);
      if (faltando.length) {
        console.warn(`⚠️ Campos ausentes para SKU ${sku}: ${faltando.join(', ')}`);
        continue;
      }

      const payloadOC = gerarPayloadOrdemCompra({
        pedido: dadosParaOC.pedido,
        produto: dadosParaOC.produto,
        sku: dadosParaOC.sku,
        quantidade: dadosParaOC.quantidade,
        valorUnitario: dadosParaOC.valorUnitario,
        idFornecedor: dadosParaOC.idFornecedor
      });

      const resposta = await enviarOrdemCompra(payloadOC);
      resultados.push({ sku, fornecedor: fornecedorSelecionado.nome, status: resposta });
    }

    console.log(`📦 Resultado final do processamento:\n`, resultados);
  } catch (err) {
    console.error('❌ Erro geral no webhook:', err.message || err);
  }
});

module.exports = router;
