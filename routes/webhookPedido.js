// routes/webhookPedido.js
const express = require('express');
const router = express.Router();

const { getProdutoFromTinyV3 } = require('../services/tinyProductService');
const { getAccessToken } = require('../services/tokenService');
const { analisarPedidoViaIA } = require('../services/openaiMarcaService');
const { enviarOrdemCompra } = require('../services/enviarOrdem');
const { gerarPayloadOrdemCompra } = require('../services/gerarPayloadOC');
const { getPedidoCompletoById } = require('../services/tinyPedidoService');

// ✅ NOVO: serviço unificado V3→V2
const { listarTodosFornecedoresUnificado } = require('../services/fornecedorService');

// ✅ Opcional: alerta WhatsApp quando IA falhar
const { enviarWhatsappErro } = require('../services/whatsAppService');

const pedidosProcessados = new Set();

function normalizarTexto(txt) {
  return txt
    ?.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .trim();
}

router.post('/', async (req, res) => {
  // responde imediatamente ao webhook
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

    // Pedido completo (com retries internos)
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

    // ✅ Lista fornecedores via serviço unificado (V3 com fallback V2)
    const fornecedores = await listarTodosFornecedoresUnificado({ pageSize: 100 });
    const resultados = [];

    for (const item of pedido.itens) {
      const produtoId = item.produto?.id;
      if (!produtoId) continue;

      const produto = await getProdutoFromTinyV3(produtoId);
      if (!produto) continue;

      const sku = produto.sku || produto.codigo || 'DESCONHECIDO';
      const marca = produto.marca?.nome?.trim();
      if (!marca) continue;

      // Match direto/heurístico local
      const marcaNormalizada = normalizarTexto(marca);
      const nomePadrao = `fornecedor ${marcaNormalizada}`; // usamos minúsculo na comparação
      let fornecedorSelecionado = fornecedores.find(
        (f) => normalizarTexto(f.nome) === nomePadrao
      );

      if (!fornecedorSelecionado) {
        fornecedorSelecionado = fornecedores.find((f) => {
          const nomeFornecedor = normalizarTexto(f.nome.replace('fornecedor', '').trim());
          return (
            nomeFornecedor.includes(marcaNormalizada) ||
            marcaNormalizada.includes(nomeFornecedor)
          );
        });
      }

      // 🔁 Fallback IA (resposta achatada)
      if (!fornecedorSelecionado) {
        const respostaIA = await analisarPedidoViaIA(
          {
            produtoSKU: sku,
            marca,
            quantidade: item.quantidade || 1,
            valorUnitario: item.valorUnitario || item.valor_unitario || 0
          },
          fornecedores
        );

        if (respostaIA?.deveGerarOC && typeof respostaIA?.idFornecedor === 'number') {
          fornecedorSelecionado = fornecedores.find((f) => Number(f.id) === Number(respostaIA.idFornecedor));
        } else {
          console.warn(`⚠️ Pedido ${numeroPedido} – IA não encontrou fornecedor para SKU ${sku}`);
          // opcional: alerta no WhatsApp para triagem manual
          try {
            await enviarWhatsappErro?.(
              `⚠️ Pedido ${numeroPedido}: IA não retornou fornecedor confiável para SKU ${sku} (marca: ${marca}).`
            );
          } catch {}
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

      // Validação mínima antes do payload
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
      const faltando = obrigatorios.filter((c) => !dadosParaOC[c]);
      if (faltando.length) {
        console.warn(`⚠️ Campos ausentes para SKU ${sku}: ${faltando.join(', ')}`);
        continue;
      }

      // Payload OC v3
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
