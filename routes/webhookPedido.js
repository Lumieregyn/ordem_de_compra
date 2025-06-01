const express = require('express');
const router = express.Router();

const { getProdutoFromTinyV3 } = require('../services/tinyProductService');
const { getAccessToken } = require('../services/tokenService');
const { analisarPedidoViaIA } = require('../services/openaiMarcaService');
const { enviarOrdemCompra } = require('../services/enviarOrdem');
const { getPedidoCompletoById } = require('../services/tinyPedidoService');
const axios = require('axios');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';
const MAX_PAGINAS = 100;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizarTexto(txt) {
  return txt
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .trim();
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

      console.log(`📄 Página ${page} - Contatos: ${contatosPagina.length}`);
      todos.push(...contatosPagina);
      page++;
      await delay(300);
    }

    const fornecedoresUnicos = Array.from(new Map(todos.map(f => [f.id, f])).values());
    console.log('📋 Fornecedores disponíveis:', fornecedoresUnicos.map(f => f.nome));
    return fornecedoresUnicos;

  } catch (err) {
    console.error('❌ Erro ao buscar fornecedores (paginado):', err.message);
    return [];
  }
}

router.post('/', async (req, res) => {
  res.status(200).send('Webhook recebido ✅');

  try {
    const body = req.body;
    const numeroPedido = body?.dados?.numero;
    const idPedido = body?.dados?.id;

    if (!numeroPedido || !idPedido) {
      console.warn('❌ Webhook sem número ou ID de pedido válido');
      return;
    }

    console.log(`📦 Webhook gatilho para pedido ${numeroPedido} (ID ${idPedido}). Buscando dados via API V3...`);
    const pedido = await getPedidoCompletoById(idPedido);

    // 🔍 LOG do pedido e itens antes de processar
    console.log('📦 Pedido completo carregado:', JSON.stringify(pedido, null, 2));

    if (!pedido.itens || !Array.isArray(pedido.itens) || pedido.itens.length === 0) {
      console.warn('⚠️ Pedido sem itens válidos. Interrompendo pipeline.');
      return;
    }

    console.log('🧾 Itens do pedido:', JSON.stringify(pedido.itens, null, 2));

    const fornecedores = await listarTodosFornecedores();
    const resultados = [];

    for (const item of pedido.itens) {
      const produtoId = item.produto?.id;
      const quantidade = item.quantidade || 1;
      const valorUnitario = item.valorUnitario || 0;

      if (!produtoId) {
        console.warn('⚠️ Item sem produto associado:', JSON.stringify(item, null, 2));
        resultados.push({ status: 'produto sem ID válido', item });
        continue;
      }

      let produto;
      try {
        produto = await getProdutoFromTinyV3(produtoId);
      } catch (err) {
        console.error(`❌ Erro ao buscar produto ID ${produtoId}:`, err.message);
        resultados.push({ produtoId, status: 'erro ao buscar produto', erro: err.message });
        continue;
      }

      if (!produto) {
        resultados.push({ produtoId, status: 'produto não encontrado (null)' });
        continue;
      }

      const sku = produto.sku || produto.codigo || 'DESCONHECIDO';
      console.log('🔎 SKU detectado:', sku);

      const marca = produto.marca?.nome?.trim();
      if (!marca) {
        resultados.push({ produtoSKU: sku, status: 'marca ausente' });
        continue;
      }

      const marcaNormalizada = normalizarTexto(marca);
      const nomePadrao = `FORNECEDOR ${marcaNormalizada}`;

      const fornecedorMatchDireto = fornecedores.find(f =>
        normalizarTexto(f.nome).includes(normalizarTexto(nomePadrao))
      );

      if (fornecedorMatchDireto) {
        console.log('✅ Match direto encontrado:', fornecedorMatchDireto.nome);
        const respostaOC = await enviarOrdemCompra({
          produtoId,
          quantidade,
          valorUnitario,
          idFornecedor: fornecedorMatchDireto.id
        });

        resultados.push({
          produtoSKU: sku,
          fornecedor: fornecedorMatchDireto.nome,
          ocCriada: true,
          ocInfo: respostaOC || null
        });
        continue;
      }

      const fornecedoresFiltrados = fornecedores.filter(f =>
        normalizarTexto(f.nome).includes(marcaNormalizada) ||
        marcaNormalizada.includes(normalizarTexto(f.nome))
      );

      console.log('🔍 Marca identificada:', marca);
      console.log('🧠 Fornecedores entregues à IA:', fornecedoresFiltrados.map(f => f.nome));

      let respostaIA;
      try {
        respostaIA = await analisarPedidoViaIA({ produto, quantidade, valorUnitario, marca }, fornecedoresFiltrados);
      } catch (err) {
        console.error('❌ Erro na inferência IA:', err.message);
        return;
      }

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
        console.log('📤 Enviando OC com dados:', { produtoId, quantidade, valorUnitario, idFornecedor: itemIA.idFornecedor });

        const respostaOC = await enviarOrdemCompra({ produtoId, quantidade, valorUnitario, idFornecedor: itemIA.idFornecedor });
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

  } catch (err) {
    console.error('❌ Erro geral no webhook:', err.message || err);
  }
});

module.exports = router;
