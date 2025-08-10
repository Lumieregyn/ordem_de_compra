// routes/webhookPedido.js
const express = require('express');
const router = express.Router();

const { getProdutoFromTinyV3 } = require('../services/tinyProductService');
const { getAccessToken } = require('../services/tokenService');
const { analisarPedidoViaIA } = require('../services/openaiMarcaService');
const { enviarOrdemCompra } = require('../services/enviarOrdem');
const { gerarPayloadOrdemCompra } = require('../services/gerarPayloadOC');
const { getPedidoCompletoById } = require('../services/tinyPedidoService');

// serviço unificado de fornecedores
const { listarTodosFornecedoresUnificado } = require('../services/fornecedorService');

const pedidosProcessados = new Set();
const LOOP_DELAY_MS = Number(process.env.WEBHOOK_ITEM_DELAY_MS || 200);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizarTexto(txt) {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .trim();
}

// converte "2.016,84" ou "2016.84" -> 2016.84 (número)
function toNumberBR(v) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim();
  // se tem vírgula como decimal, remove pontos e troca vírgula por ponto
  const normalized = s.includes(',')
    ? s.replace(/\./g, '').replace(',', '.')
    : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
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

    if (!Array.isArray(pedido.itens) || pedido.itens.length === 0) {
      console.warn(`⚠️ Pedido ${numeroPedido} retornado sem itens. Ignorando.`);
      return;
    }

    console.log(`📄 Pedido completo recebido:\n`, JSON.stringify(pedido, null, 2));

    // fornecedores (V3 com fallback V2)
    const fornecedores = await listarTodosFornecedoresUnificado({ pageSize: 100 });
    console.log(`📚 Fornecedores carregados: ${fornecedores.length}`);

    const resultados = [];

    for (const item of pedido.itens) {
      const produtoId = item.produto?.id;
      if (!produtoId) continue;

      const produto = await getProdutoFromTinyV3(produtoId);
      if (!produto) continue;

      const sku = produto.sku || produto.codigo || 'DESCONHECIDO';
      const marca = produto.marca?.nome?.trim();
      if (!marca) continue;

      // ---------- Seleção de fornecedor ----------
      const marcaNormalizada = normalizarTexto(marca);
      const nomePadraoNormalizado = normalizarTexto(`FORNECEDOR ${marca}`);
      let fornecedorSelecionado =
        fornecedores.find((f) => normalizarTexto(f.nome) === nomePadraoNormalizado) ||
        fornecedores.find((f) => {
          const nome = normalizarTexto(f.nome).replace(/^fornecedor/, '').trim();
          return nome.includes(marcaNormalizada) || marcaNormalizada.includes(nome);
        });

      if (!fornecedorSelecionado) {
        // fallback IA
        const respostaIA = await analisarPedidoViaIA(
          {
            produto,
            quantidade: item.quantidade ?? 1,
            valorUnitario: item.valorUnitario ?? item.valor_unitario ?? item['valorUnitário'] ?? item.valor ?? null,
            marca,
          },
          fornecedores
        );

        // aceita modelo “achatado” OU com {itens:[]}
        const escolha =
          (respostaIA && respostaIA.itens && Array.isArray(respostaIA.itens) && respostaIA.itens[0]) ||
          (respostaIA && typeof respostaIA === 'object' ? respostaIA : null);

        if (escolha?.deveGerarOC && escolha?.idFornecedor != null) {
          fornecedorSelecionado = fornecedores.find((f) => Number(f.id) === Number(escolha.idFornecedor));
        } else {
          console.warn(`⚠️ Pedido ${numeroPedido} – IA não encontrou fornecedor para SKU ${sku}`);
          continue;
        }
      }

      // ---------- Mapeamento robusto de quantidade/valor ----------
      const valorUnitRaw =
        item.valorUnitario ??
        item.valor_unitario ??
        item['valorUnitário'] ?? // acento
        item.valor ??
        null;

      const quantidadeRaw = item.quantidade ?? item.qtd ?? 1;

      const valorUnitario = toNumberBR(valorUnitRaw);
      const quantidade = toNumberBR(quantidadeRaw) ?? 1;

      const dadosParaOC = {
        produtoId: produto.id,
        quantidade,
        valorUnitario,
        sku,
        idFornecedor: fornecedorSelecionado?.id,
        nomeFornecedor: fornecedorSelecionado?.nome,
        pedido,
        produto,
      };

      // validação: null/undefined é ausente; quantidade/valor precisam ser > 0
      const obrigatorios = [
        'produtoId',
        'quantidade',
        'valorUnitario',
        'sku',
        'idFornecedor',
        'nomeFornecedor',
        'pedido',
        'produto',
      ];

      const faltando = obrigatorios.filter((c) => {
        const v = dadosParaOC[c];
        if (v == null) return true;
        if (c === 'quantidade' || c === 'valorUnitario') return !(Number(v) > 0);
        return false;
      });

      if (faltando.length) {
        console.warn(`⚠️ Campos ausentes/invalidos para SKU ${sku}: ${faltando.join(', ')}`, {
          debugValor: { quantidade, valorUnitario, bruto: valorUnitRaw },
        });
        continue;
      }

      // ---------- Geração e envio da OC ----------
      const payloadOC = gerarPayloadOrdemCompra({
        pedido: dadosParaOC.pedido,
        produto: dadosParaOC.produto,
        sku: dadosParaOC.sku,
        quantidade: dadosParaOC.quantidade,
        valorUnitario: dadosParaOC.valorUnitario,
        idFornecedor: dadosParaOC.idFornecedor,
      });

      const resposta = await enviarOrdemCompra(payloadOC);
      resultados.push({ sku, fornecedor: fornecedorSelecionado.nome, status: resposta });

      // throttle leve entre itens para reduzir 429
      if (LOOP_DELAY_MS > 0) await delay(LOOP_DELAY_MS);
    }

    console.log(`📦 Resultado final do processamento:\n`, resultados);
  } catch (err) {
    console.error('❌ Erro geral no webhook:', err.message || err);
  }
});

module.exports = router;
