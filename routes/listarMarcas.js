const { processarProdutosTiny } = require('../services/tinyService');

async function listarMarcas(req, res) {
  try {
    const resultado = await processarProdutosTiny();
    res.json({ sucesso: true, ...resultado });
  } catch (err) {
    console.error('❌ Erro em /listar-marcas:', err);
    res.status(500).json({ sucesso: false, erro: 'Falha ao listar marcas' });
  }
}

module.exports = { listarMarcas };
