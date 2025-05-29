// services/tinyFornecedorService.js

const axios = require('axios');
const { getAccessToken } = require('./tokenService');
const { TINY_API_V3_BASE, delay, normalizarTexto } = require('./tinyUtils');

/**
 * Lista todos os fornecedores válidos.
 * Critérios:
 * - Pessoa Jurídica
 * - Nome começa com "FORNECEDOR "
 */
async function listarFornecedoresPadronizados() {
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

      const fornecedores = contatosPagina.filter(c =>
        c.tipoPessoa === 'J' &&
        c.nome &&
        c.nome.toUpperCase().startsWith('FORNECEDOR ')
      );

      todos.push(...fornecedores);
      page++;
      await delay(250);
    }

    const unicos = Array.from(new Map(todos.map(f => [f.id, f])).values());
    console.log('📋 Fornecedores disponíveis:', unicos.map(f => f.nome));
    return unicos;
  } catch (err) {
    console.error('❌ Erro ao buscar fornecedores:', err.message);
    return [];
  }
}

module.exports = { listarFornecedoresPadronizados };
