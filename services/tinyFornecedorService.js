// Nova versão completa de services/tinyFornecedorService.js
const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';

function normalizarTexto(str) {
  return str
    ?.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

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

    const marcaNormalizada = normalizarTexto(nomeMarca);

    const fornecedor = contatos.find(f => {
      const nomeFornecedor = normalizarTexto(f.nome);
      return nomeFornecedor.includes(marcaNormalizada);
    });

    if (fornecedor) {
      console.log(`🔍 Fornecedor identificado: ${fornecedor.nome} (ID: ${fornecedor.id})`);
      return fornecedor.id;
    } else {
      console.warn(`❌ Nenhum fornecedor compatível com marca: ${nomeMarca}`);
      return null;
    }

  } catch (err) {
    console.error('❌ Erro ao buscar fornecedores da Tiny:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { getFornecedorIdPorNome };
