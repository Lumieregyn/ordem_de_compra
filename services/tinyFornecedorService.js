const axios = require('axios');
const { getAccessToken } = require('./tokenService');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const MAX_PAGINAS = 30;

function normalizarFornecedor(nome) {
  return nome
    ?.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\b(FORNECEDOR|LTDA|ME|URGENTE|ASSOCIACAO|ASSOCIAÇÃO|CINDY|\+LUZ)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function listarTodosFornecedores() {
  const token = await getAccessToken();
  if (!token) return [];

  const fornecedoresMap = new Map();
  let totalBruto = 0;
  let comNomePadrao = 0;
  const foraDoPadrao = [];

  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    try {
      const url = `https://erp.tiny.com.br/public-api/v3/contatos?tipo=J&page=${pagina}&limit=50`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const lista = response.data?.itens || [];
      console.log(`📄 Página ${pagina} retornou ${lista.length} fornecedores`);
      if (!lista.length) break;

      for (const f of lista) {
        if (!f?.id || !f?.nome || f?.tipoPessoa !== 'J') continue;

        // ❗️ NOVO: Ignorar se não tiver CNPJ ou nome não contiver "FORNECEDOR"
        const cnpj = f.cnpj?.replace(/\D/g, '') || f.cpf_cnpj?.replace(/\D/g, '');
        if (!cnpj || !f.nome.toUpperCase().includes('FORNECEDOR')) continue;

        totalBruto++;

        const nomeOriginal = f.nome.trim();
        const nomeNormalizado = normalizarFornecedor(nomeOriginal);

        if (nomeOriginal.toUpperCase().startsWith('FORNECEDOR')) comNomePadrao++;
        else foraDoPadrao.push({ id: f.id, nome: nomeOriginal });

        if (!fornecedoresMap.has(cnpj)) {
          fornecedoresMap.set(cnpj, {
            id: f.id,
            nomeOriginal,
            nomeNormalizado,
            cnpj,
            cidade: f.cidade,
            email: f.email,
            telefone: f.fone
          });
        }
      }

      const ultimaPagina = response.data?.retorno?.pagina?.ultima === 'true';
      if (ultimaPagina) break;

      await delay(500);
    } catch (err) {
      console.error(`[listarTodosFornecedores] Erro na página ${pagina}:`, err.message);
      break;
    }
  }

  const fornecedores = Array.from(fornecedoresMap.values());

  console.log(`📦 Total de PJ recebidos da Tiny (bruto): ${totalBruto}`);
  console.log(`✅ Com nome padrão "FORNECEDOR...": ${comNomePadrao}`);
  console.log(`🚫 Fora do padrão (mantidos para IA/heurística): ${foraDoPadrao.length}`);
  if (foraDoPadrao.length > 0) {
    console.log('📋 Exemplos de nomes fora do padrão:');
    console.table(foraDoPadrao.slice(0, 10));
  }

  console.table(fornecedores.slice(0, 20));
  return fornecedores;
}

module.exports = {
  listarTodosFornecedores,
  normalizarFornecedor
};
