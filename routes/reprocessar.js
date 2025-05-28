const express = require('express');
const router = express.Router();

const { getProdutosCollection } = require('../services/mongoClient');
const { fetchMarcaV3 } = require('../services/tinyService');
const { getAccessToken } = require('../services/tokenService');

const MAX_REPROCESS = 10;

router.get('/reprocessar-marcas', async (req, res) => {
  try {
    const token = getAccessToken();
    if (!token) return res.status(401).json({ erro: 'Token v3 ausente. Rode /auth.' });

    const produtosCollection = getProdutosCollection();

    // Buscar até 10 produtos sem marca
    const pendentes = await produtosCollection
      .find({ marca: null })
      .limit(MAX_REPROCESS)
      .toArray();

    if (!pendentes.length) {
      return res.json({ mensagem: 'Sem produtos pendentes para reprocessar.' });
    }

    // Buscar marcas conhecidas para heurística
    const marcasConhecidas = await produtosCollection
      .distinct('marca', { marca: { $ne: null } });

    const atualizados = [];

    for (const prod of pendentes) {
      const novaMarca = await fetchMarcaV3(prod.id, marcasConhecidas);

      await produtosCollection.updateOne(
        { codigo: prod.codigo },
        { $set: { marca: novaMarca || null, atualizado_em: new Date().toISOString() } }
      );

      atualizados.push({
        codigo: prod.codigo,
        novaMarca: novaMarca || 'N/A'
      });
    }

    return res.json({
      sucesso: true,
      total: atualizados.length,
      produtosAtualizados: atualizados
    });

  } catch (err) {
    console.error('❌ Erro em /reprocessar-marcas:', err);
    res.status(500).json({ erro: 'Erro interno ao reprocessar marcas' });
  }
});

module.exports = router;
