const express = require('express');
const router = express.Router();

const { getProdutoFromTinyV3 } = require('../services/tinyProductService');
const { getAccessToken } = require('../services/tokenService');
const { analisarPedidoViaIA } = require('../services/openaiMarcaService');
const { enviarOrdemCompra } = require('../services/enviarOrdem');
const { gerarPayloadOrdemCompra } = require('../services/gerarPayloadOC');
const { getPedidoCompletoById } = require('../services/tinyPedidoService');
const { enviarNotificacaoWhatsapp } = require('../services/whatsappService'); // ⚠️ certifique-se que está criado
const axios = require('axios');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';
const MAX_PAGINAS = 10;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

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

      const sku = produto.sku || produto.codigo || 'DESCONHECIDO';
      const marca = produto.marca?.nome?.trim();
      if (!marca) continue;

      const marcaNormalizada = normalizarTexto(marca);
      const nomePadrao = `FORNECEDOR ${marcaNormalizada}`;
      let fornecedorSelecionado = fornecedores.find(f =>
        normalizarTexto(f.nome) === nomePadrao
      );

      // Heurística se não encontrou match exato
      if (!fornecedorSelecionado) {
        fornecedorSelecionado = fornecedores.find(f =>
          normalizarTexto(f.nome).includes(marcaNormalizada) ||
          marcaNormalizada.includes(normalizarTexto(f.nome).replace('fornecedor', '').trim())
        );
      }

      // Fallback IA
      if (!fornecedorSelecionado) {
        const respostaIA = await analisarPedidoViaIA({
          produtoSKU: sku,
          marca,
          fornecedores
        });

        if (respostaIA?.deveGerarOC && typeof respostaIA?.idFornecedor === 'number') {
          fornecedorSelecionado = fornecedores.find(f => f.id === respostaIA.idFornecedor);
        } else {
          console.warn(`⚠️ IA não encontrou fornecedor para SKU ${sku} / Marca ${marca}`);
          await enviarNotificacaoWhatsapp(`⚠️ Pedido ${numeroPedido} – Fornecedor não identificado para SKU ${sku}. OC não será gerada.`);
          continue;
        }
      }

      if (!fornecedorSelecionado?.id) {
        console.warn(`⚠️ Fornecedor inválido detectado para SKU ${sku}`);
        await enviarNotificacaoWhatsapp(`⚠️ Pedido ${numeroPedido} – Fornecedor inválido para SKU ${sku}.`);
        continue;
      }

      // Preparar dados para gerarPayloadOrdemCompra
      const dadosParaOC = {
        produtoId: produto.id,
        quantidade: item.quantidade || 1,
        valorUnitario: item.valorUnitario || item.valor_unitario || 0,
        sku,
        idFornecedor: fornecedorSelecionado.id,
        nomeFornecedor: fornecedorSelecionado.nome,
        pedido,
        produto
      };

      // Validação final antes de gerar payload
      const obrigatorios = ['produtoId', 'quantidade', 'valorUnitario', 'sku', 'idFornecedor', 'nomeFornecedor'];
      const faltando = obrigatorios.filter(c => !dadosParaOC[c]);
      if (faltando.length) {
        console.error(`❌ Campos obrigatórios faltando para SKU ${sku}:`, faltando);
        await enviarNotificacaoWhatsapp(`❌ Pedido ${numeroPedido} – Campos ausentes: ${faltando.join(', ')}. OC não enviada.`);
        continue;
      }

      const payloadOC = gerarPayloadOrdemCompra({
        origem: pedido.origem || 'comercial',
        dataPedido: pedido.data || new Date().toISOString().split('T')[0],
        dataPrevista: pedido.dataPrevista,
        estimativaEntrega: 7,
        condicaoPagamento: pedido.condicao || "A prazo 30 dias",
        parcelas: pedido.parcelas || [],
        vendedor: { nome: pedido?.vendedor?.nome || 'Desconhecido' },
        pedidoNumero: numeroPedido,
        contatoId: dadosParaOC.idFornecedor,
        produto: {
          id: dadosParaOC.produtoId,
          sku: dadosParaOC.sku,
          quantidade: dadosParaOC.quantidade,
          valor: dadosParaOC.valorUnitario
        },
        fornecedor: {
          id: dadosParaOC.idFornecedor,
          nome: dadosParaOC.nomeFornecedor
        },
        pedido: dadosParaOC.pedido,
        produtoObj: dadosParaOC.produto
      });

      const resposta = await enviarOrdemCompra(payloadOC);
      resultados.push({ sku, fornecedor: fornecedorSelecionado.nome, status: resposta });
    }
  } catch (err) {
    console.error('❌ Erro geral no webhook:', err.message || err);
  }
});

module.exports = router;
