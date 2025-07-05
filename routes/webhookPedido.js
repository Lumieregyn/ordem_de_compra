const express = require('express');
const router = express.Router();

const { getPedidoCompletoById } = require('../services/tinyPedidoService');
const { getProdutoFromTinyV3 } = require('../services/tinyProductService');
const { getAccessToken } = require('../services/tokenService');
const { enviarOrdemCompra } = require('../services/enviarOrdem');
const { gerarPayloadOrdemCompra } = require('../services/gerarPayloadOC');
const { analisarPedidoViaIA } = require('../services/openaiMarcaService');
const { listarTodosFornecedores, normalizarFornecedor } = require('../services/tinyFornecedorService');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const pedidosProcessados = new Set();

function filtrarItensNecessarios(itens) {
  return itens.filter(item => item.produto?.sku?.toUpperCase().includes('PEDIDO'));
}

function agruparItensPorMarca(itens) {
  const grupos = {};
  for (const item of itens) {
    const marca = item.marca || 'DESCONHECIDA';
    if (!grupos[marca]) grupos[marca] = [];
    grupos[marca].push(item);
  }
  return grupos;
}

router.post('/', async (req, res) => {
  const idPedido = req.body?.dados?.id;
  const numeroPedido = req.body?.dados?.numero;

  console.log(`📥 Webhook recebido: ID ${idPedido}, Número ${numeroPedido}`);

  if (!idPedido || !numeroPedido) {
    console.warn('❌ Webhook sem ID ou número válido');
    return res.status(200).json({ mensagem: 'Webhook ignorado: dados incompletos.' });
  }

  if (pedidosProcessados.has(idPedido)) {
    console.warn(`⏩ Pedido ID ${idPedido} já processado anteriormente.`);
    return res.status(200).json({ mensagem: 'Pedido duplicado ignorado.' });
  }

  pedidosProcessados.add(idPedido);

  const pedido = await getPedidoCompletoById(idPedido);
  if (!pedido?.id || pedido.situacao === undefined) {
    console.warn(`⚠️ Pedido ${numeroPedido} com dados incompletos.`);
    return res.status(200).json({ mensagem: 'Pedido incompleto. Ignorado.' });
  }

  if (pedido.situacao !== 3) {
    console.log(`🛑 Pedido ${numeroPedido} ignorado. Situação atual: ${pedido.situacao}`);
    return res.status(200).json({ mensagem: 'Situação inválida para geração de OC.' });
  }

  const itensFiltrados = filtrarItensNecessarios(pedido.itens);
  if (itensFiltrados.length === 0) {
    console.log(`🛑 Pedido ${numeroPedido} sem itens sob encomenda.`);
    return res.status(200).json({ mensagem: 'Nenhuma OC será gerada.' });
  }

  const fornecedores = await listarTodosFornecedores();
  console.log(`📦 Fornecedores PJ encontrados: ${fornecedores.length}`);
  console.table(fornecedores.map(f => ({ id: f.id, nome: f.nomeOriginal })));

  const itensEnriquecidos = [];

  for (const item of itensFiltrados) {
    try {
      const produtoId = item.produto?.id;
      if (!produtoId) continue;

      console.log(`🔍 Buscando produto ${produtoId}`);
      let produto = await getProdutoFromTinyV3(produtoId);
      if (!produto) {
        console.warn(`⚠️ Retentando produto ID ${produtoId}...`);
        await delay(3000);
        produto = await getProdutoFromTinyV3(produtoId);
      }

      if (!produto) {
        console.warn(`⚠️ Produto ID ${produtoId} não encontrado`);
        continue;
      }

      const sku = produto.sku || produto.codigo || 'DESCONHECIDO';
      const marca = produto.marca?.nome?.trim() || 'DESCONHECIDA';
      const quantidade = item.quantidade || 1;
      const valorUnitario = item.valorUnitario || item.valor_unitario || 0;

      itensEnriquecidos.push({
        ...item,
        sku,
        marca,
        produto,
        quantidade,
        valorUnitario
      });

      await delay(300);
    } catch (err) {
      console.error('❌ Erro ao buscar produto do item:', err.message);
    }
  }

  const agrupados = agruparItensPorMarca(itensEnriquecidos);
  const resultados = [];

  for (const [marca, itensDaMarca] of Object.entries(agrupados)) {
    try {
      const marcaNorm = normalizarFornecedor(marca);

      let fornecedor = fornecedores.find(f => f.nomeNormalizado === marcaNorm) ||
                       fornecedores.find(f => f.nomeNormalizado.includes(marcaNorm));

      if (!fornecedor) {
        const contexto = {
          marca,
          produtoSKU: itensDaMarca[0]?.sku || '',
          quantidade: itensDaMarca[0]?.quantidade || 1,
          valorUnitario: itensDaMarca[0]?.valorUnitario || 0,
          produto: itensDaMarca[0]?.produto || {}
        };

        const respostaIA = await analisarPedidoViaIA(contexto, fornecedores);
        const itemIA = respostaIA?.itens?.[0];
        if (itemIA?.deveGerarOC && itemIA?.idFornecedor) {
          fornecedor = fornecedores.find(f => f.id === itemIA.idFornecedor);
        }
      }

      if (!fornecedor) {
        console.warn(`⚠️ Nenhum fornecedor identificado para marca ${marca}`);
        continue;
      }

      console.log(`🧾 Gerando payload para marca ${marca}`);
      const payload = gerarPayloadOrdemCompra({
        numeroPedido,
        nomeCliente: pedido.cliente?.nome || '',
        dataPrevista: pedido.dataPrevista,
        itens: itensDaMarca,
        fornecedor
      });

      if (!payload || !payload.itens?.length) {
        console.warn(`❌ Payload inválido para OC da marca ${marca}`);
        continue;
      }

      console.log(`🚚 Enviando OC para fornecedor ${fornecedor.nomeOriginal}`);
      const resposta = await enviarOrdemCompra(payload);

      resultados.push({
        marca,
        fornecedor: fornecedor.nomeOriginal,
        status: resposta
      });

    } catch (err) {
      console.error(`❌ Erro ao processar grupo da marca ${marca}:`, err.message || err);
    }
  }

  console.log('📦 Resultado final:\n', resultados);
  return res.status(200).json({ mensagem: 'Processamento finalizado', resultados });
});

module.exports = router;
