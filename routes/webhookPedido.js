// routes/webhookPedido.js - Versão limpa, WhatsApp só via IA do validarRespostaOrdem.js

const express = require('express');
const router = express.Router();

const { getProdutoFromTinyV3 } = require('../services/tinyProductService');
const { analisarPedidoViaIA } = require('../services/openaiMarcaService');
const { enviarOrdemCompra } = require('../services/enviarOrdem');
const { gerarPayloadOrdemCompra } = require('../services/gerarPayloadOC');
const { getPedidoCompletoById } = require('../services/tinyPedidoService');
const { validarRespostaOrdem } = require('../services/validarRespostaOrdemService');
const { listarTodosFornecedoresUnificado } = require('../services/fornecedorService');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pedidosProcessados = new Set();
const LOOP_DELAY_MS = Number(process.env.WEBHOOK_ITEM_DELAY_MS || 200);

function normalizarTexto(txt) {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .trim();
}

function filtrarItensNecessarios(itens) {
  // Mantido: somente itens cujo SKU contém "PEDIDO"
  return (Array.isArray(itens) ? itens : []).filter(
    (item) => item?.produto?.sku && String(item.produto.sku).toUpperCase().includes('PEDIDO')
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

router.post('/', async (req, res) => {
  try {
    const idPedido = req.body?.dados?.id;
    const numeroRecebido = req.body?.dados?.numero;

    // Não dispara WhatsApp aqui! Apenas responde HTTP.
    if (!idPedido || !numeroRecebido) {
      return res.status(200).json({ mensagem: 'Webhook ignorado: dados incompletos.' });
    }

    if (pedidosProcessados.has(idPedido)) {
      return res.status(200).json({ mensagem: 'Pedido já processado anteriormente.' });
    }

    const pedido = await getPedidoCompletoById(idPedido);
    const numeroPedido = pedido?.numeroPedido || '[sem número]';

    if (!pedido || !pedido.id || !pedido.numeroPedido || pedido.situacao === undefined) {
      return res.status(200).json({ mensagem: 'Pedido com dados incompletos. Ignorado.' });
    }

    // Situação 3 = aprovado (mantida sua regra)
    if (Number(pedido.situacao) !== 3) {
      return res.status(200).json({
        mensagem: `Pedido ${numeroPedido} com situação ${pedido.situacao} não será processado.`
      });
    }

    pedidosProcessados.add(idPedido);

    // 1) Filtra itens
    const itensFiltrados = filtrarItensNecessarios(pedido.itens);
    if (itensFiltrados.length === 0) {
      return res.status(200).json({ mensagem: 'Nenhuma OC será gerada. Itens são de estoque.' });
    }

    // 2) Carrega fornecedores (V3 unificado). Se vier vazio, encerra (sem IA).
    const fornecedores = await listarTodosFornecedoresUnificado({ pageSize: 100 });
    console.log(`📚 Fornecedores carregados: ${Array.isArray(fornecedores) ? fornecedores.length : 0}`);

    if (!Array.isArray(fornecedores) || fornecedores.length === 0) {
      return res.status(200).json({
        mensagem: `Lista de fornecedores vazia. Pedido ${numeroPedido} ignorado.`
      });
    }

    // 3) Enriquecer itens com produto/sku/marca/valor
    const itensEnriquecidos = [];
    for (const item of itensFiltrados) {
      try {
        const produtoId = item?.produto?.id;
        const quantidade = item?.quantidade ?? 1;
        const valorUnitario =
          item?.valorUnitario ?? item?.valor_unitario ?? item?.['valorUnitário'] ?? item?.valor ?? 0;

        if (!produtoId) continue;

        const produto = await getProdutoFromTinyV3(produtoId);
        if (!produto) continue;

        const sku = produto?.sku || produto?.codigo || 'DESCONHECIDO';
        const marca = produto?.marca?.nome?.trim();
        if (!marca) continue;

        itensEnriquecidos.push({ ...item, produto, sku, quantidade, valorUnitario, marca });
      } catch (erroProduto) {
        console.error('❌ Erro ao buscar produto do item:', erroProduto?.message || erroProduto);
      }
    }

    if (itensEnriquecidos.length === 0) {
      return res.status(200).json({ mensagem: 'Nenhum item elegível após enriquecimento.' });
    }

    // 4) Agrupar por marca
    const agrupadosPorMarca = agruparItensPorMarca(itensEnriquecidos);
    const resultados = [];

    // 5) Para cada marca, tentar achar fornecedor; se não, IA; se ainda não, registrar via validarRespostaOrdem
    for (const [marca, itensDaMarca] of Object.entries(agrupadosPorMarca)) {
      const marcaNorm = normalizarTexto(marca);

      let fornecedor =
        fornecedores.find((f) => normalizarTexto(f?.nome) === `fornecedor ${marcaNorm}`) ||
        fornecedores.find((f) => {
          const nome = normalizarTexto(f?.nome || '').replace(/^fornecedor/, '').trim();
          return nome.includes(marcaNorm) || marcaNorm.includes(nome);
        });

      if (!fornecedor) {
        // Chama IA apenas se tivermos fornecedores para escolher
        const respostaIA = await analisarPedidoViaIA(
          {
            marca,
            produtoSKU: itensDaMarca[0]?.sku || 'DESCONHECIDO',
            quantidade: itensDaMarca[0]?.quantidade ?? 1,
            valorUnitario:
              itensDaMarca[0]?.valorUnitario ??
              itensDaMarca[0]?.valor_unitario ??
              itensDaMarca[0]?.['valorUnitário'] ??
              itensDaMarca[0]?.valor ??
              null
          },
          fornecedores
        );

        if (respostaIA?.deveGerarOC && respostaIA?.idFornecedor != null) {
          fornecedor = fornecedores.find((f) => String(f.id) === String(respostaIA.idFornecedor));
        }
      }

      if (!fornecedor) {
        // Mantido: delega o alerta/registro ao validarRespostaOrdem (sua IA de notificação)
        const skus = itensDaMarca.map((i) => i.sku).join(', ');
        try {
          await validarRespostaOrdem(
            { retorno: { mensagem: 'Nenhum fornecedor identificado', detalhes: skus } },
            numeroPedido,
            marca,
            null
          );
        } catch (e) {
          console.warn('⚠️ validarRespostaOrdem falhou (sem WhatsApp aqui):', e?.message || e);
        }
        continue;
      }

      // 6) Gera OC por item (compatível com gerarPayloadOrdemCompra V3)
      for (const it of itensDaMarca) {
        const payloadOC = gerarPayloadOrdemCompra({
          pedido,                        // usado para data/parcelas
          produto: it.produto,           // precisa do id do produto
          sku: it.sku,
          quantidade: it.quantidade,
          valorUnitario: it.valorUnitario,
          idFornecedor: fornecedor.id
        });

        if (!payloadOC || !Array.isArray(payloadOC.itens) || payloadOC.itens.length === 0) {
          continue;
        }

        try {
          const resposta = await enviarOrdemCompra(payloadOC);
          const sucesso = await validarRespostaOrdem(resposta, numeroPedido, marca, fornecedor);
          resultados.push({
            marca,
            fornecedor: fornecedor?.nome,
            sku: it.sku,
            status: sucesso ? 'OK' : 'Falha'
          });

          if (LOOP_DELAY_MS > 0) await delay(LOOP_DELAY_MS);
        } catch (erroEnvio) {
          console.error(
            `❌ Erro ao enviar OC da marca ${marca} (SKU ${it.sku}) no pedido ${numeroPedido}`,
            erroEnvio?.message || erroEnvio
          );
        }
      }
    }

    return res.status(200).json({ mensagem: 'OC(s) processada(s)', resultados });
  } catch (err) {
    // Erros genéricos: só log, sem WhatsApp
    console.error('❌ Erro geral ao processar webhook:', err?.message || err);
    return res.status(500).json({ erro: 'Erro interno no processamento do webhook.' });
  }
});

module.exports = router;
