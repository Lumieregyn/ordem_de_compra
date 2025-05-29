const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';

async function getFornecedorIdPorNome(nomeMarca) {
  const token = getAccessToken();
  if (!token) {
    console.warn('⚠️ TOKEN ausente. Rode /auth → /callback primeiro.');
    return null;
  }

  try {
    const response = await axios.get(`${TINY_API_V3_BASE}/contatos`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const contatos = response.data._embedded?.contatos || [];

    // Match case-insensitive: marca === nome do contato
    const fornecedor = contatos.find(contato =>
      contato.nome.toLowerCase().trim() === nomeMarca.toLowerCase().trim()
    );

    if (fornecedor) {
      console.log(`🔍 Fornecedor encontrado: ${fornecedor.nome} (ID: ${fornecedor.id})`);
      return fornecedor.id;
    } else {
      console.warn(`❌ Nenhum fornecedor encontrado com nome: ${nomeMarca}`);
      return null;
    }

  } catch (err) {
    console.error('❌ Erro ao buscar fornecedores da Tiny:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { getFornecedorIdPorNome };
