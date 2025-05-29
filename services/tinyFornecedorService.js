const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';

// Função para normalizar texto (remover acentos, minúsculas)
function normalizarTexto(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '') // remove símbolos e espaços
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
    const nomeMarcaNorm = normalizarTexto(nomeMarca);

    // Match flexível por normalização
    const fornecedor = contatos.find(contato => {
      const nomeContatoNorm = normalizarTexto(contato.nome);
      return (
        nomeContatoNorm === nomeMarcaNorm ||               // Igual
        nomeContatoNorm.startsWith(nomeMarcaNorm) ||       // Começa com
        nomeContatoNorm.includes(nomeMarcaNorm)            // Contém
      );
    });

    if (fornecedor) {
      console.log(`✅ Fornecedor encontrado: ${fornecedor.nome} (ID: ${fornecedor.id})`);
      return fornecedor.id;
    } else {
      console.warn(`❌ Nenhum fornecedor compatível com marca: ${nomeMarca}`);
      return null;
    }

  } catch (err) {
    console.error('❌ Erro ao buscar fornecedores:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { getFornecedorIdPorNome };
