const express = require('express');
const router = express.Router();

const { getProdutoFromTinyV3 } = require('../services/tinyProductService');
const { getAccessToken } = require('../services/tokenService');
const { analisarPedidoViaIA } = require('../services/openaiMarcaService');
const { enviarOrdemCompra } = require('../services/enviarOrdem');
const axios = require('axios');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';

async function listarTodosFornecedores() {
  const token = getAccessToken();
  if (!token) return [];

  const todos = [];
  let page = 1;
  const limit = 50;

  try {
    while (true) {
      const response = await axios.get(`${TINY_API_V3_BASE}/contatos?page=${page}&limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const contatosPagina = response.data.itens || [];
      if (!contatosPagina.length) break;

      console.log(`📄 Página ${page} - Contatos: ${contatosPagina.length}`);
      console.log('🧾 Contatos recebidos (bruto):', contatosPagina.map(c => ({
        nome: c.nome,
        tipoPessoa: c.tipoPessoa
      })));

      const fornecedoresPagina = contatosPagina.filter(c =>
        c.tipoPessoa === 'J' && c.nome && (
          c.nome.toLowerCase().includes('ltda') ||
          c.nome.toLowerCase().includes('ilumina') ||
          c.nome.toLowerCase().includes('engenharia') ||
          c.nome.toLowerCase().includes('comerc') ||
          c.nome.toLowerCase().includes('materiais') ||
          c.nome.toLowerCase().includes('forneced') ||
          c.nome.toLowerCase().includes('industri') ||
          c.nome.toLowerCase().includes('servi') ||
          c.nome.toLowerCase().includes('epp')
        )
      );

      todos.push(...fornecedoresPagina);
      page++;
    }

    // Deduplicar por ID
    const fornecedoresUnicos = Array.from(new Map(todos.map(f => [f.id, f])).values());
    console.log('📦 Total de fornecedores únicos:', fornecedoresUnicos.length);
    return fornecedoresUnicos;

  } catch (err) {
    console.error('❌ Erro ao buscar fornecedores (paginado):', err.message);
    return [];
  }
}

router.post('/', async (req, res) => {
  try {
    const pedido = req.body;
    if (!pedido || !pedido.itens || !pedido.itens.length) {
      return res.status(400).json({ erro: 'Pedido inválido ou sem itens.' });
    }

    const fornecedores = await listarTodosFornecedores();
    console.log('📋 Fornecedores disponíveis:', fornecedores.map(f => f.nome));
    const resultados = [];

    for (const item of pedido.itens) {
      const produtoId = item.produto?.id;
      const quantidade = item.quantidade || 1;
      const valorUnitario = item.valorUnitario || 0;

      if (!produtoId) {
        resultados.push({ status: 'produto sem ID válido', item });
        continue;
      }

      const produto = await getProdutoFromTinyV3(produtoId);
      const sku = produto.sku || produto.codigo || 'DESCONHECIDO';
      console.log('🔎 SKU detectado:', sku);

      const marca = produto.marca?.nome?.trim();
      if (!marca) {
        resultados.push({ produtoSKU: sku, status: 'marca ausente' });
        continue;
      }

      console.log('🔍 Marca identificada:', marca);
      console.log('🧠 Fornecedores entregues à IA:', fornecedores.map(f => f.nome));

      let respostaIA;
      try {
        respostaIA = await analisarPedidoViaIA({
          produto,
          quantidade,
          valorUnitario,
          marca
        }, fornecedores);
      } catch (err) {
        console.error('❌ Erro na inferência IA:', err.message);
        return res.status(500).json({ erro: 'Erro na análise da IA' });
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
        console.log('📤 Enviando OC com dados:', {
          produtoId,
          quantidade,
          valorUnitario,
          idFornecedor: itemIA.idFornecedor
        });

        const respostaOC = await enviarOrdemCompra({
          produtoId,
          quantidade,
          valorUnitario,
          idFornecedor: itemIA.idFornecedor
        });

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

    res.json({ status: 'ok', resultados });

  } catch (err) {
    console.error('❌ Erro geral no webhook:', err.message || err);
    res.status(500).json({ erro: 'Erro ao processar pedido' });
  }
});

module.exports = router;
