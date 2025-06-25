const axios = require('axios');

const BASE_URL = 'https://api.tiny.com.br/api2/fornecedores.pesquisa.php';
const API_TOKEN = process.env.TINY_API_TOKEN;

// Delay para evitar erro 429
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Normaliza nome para matching
function normalizarFornecedor(nome) {
  return nome
    ?.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\b(FORNECEDOR|LTDA|ME|URGENTE)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function listarTodosFornecedores() {
  const fornecedoresBrutos = [];
  const fornecedoresValidosMap = new Map();
  const fornecedoresIgnorados = [];
  const maxPaginas = 20;
  const delayEntreRequisicoes = 800;

  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    try {
      const url = `${BASE_URL}?token=${API_TOKEN}&formato=json&pagina=${pagina}&tipo=J`;
      const response = await axios.get(url);
      const lista = response.data?.retorno?.fornecedores || [];

      if (lista.length === 0) break;

      lista.forEach(item => {
        const f = item?.fornecedor;
        if (f?.id && f?.nome && f?.tipoPessoa === 'J') {
          fornecedoresBrutos.push(f);

          if (f.nome.toUpperCase().startsWith('FORNECEDOR ')) {
            fornecedoresValidosMap.set(f.id, {
              id: f.id,
              nomeOriginal: f.nome,
              nomeNormalizado: normalizarFornecedor(f.nome)
            });
          } else {
            fornecedoresIgnorados.push({
              id: f.id,
              nome: f.nome
            });
          }
        }
      });

      const ultimaPagina = response.data?.retorno?.pagina?.ultima === "true";
      if (ultimaPagina) break;

      await delay(delayEntreRequisicoes);
    } catch (error) {
      console.error(`[listarTodosFornecedores] Erro na página ${pagina}:`, error.response?.data || error.message);
      break;
    }
  }

  const fornecedoresValidos = Array.from(fornecedoresValidosMap.values());

  console.log(`📦 Total de fornecedores PJ retornados: ${fornecedoresBrutos.length}`);
  console.log(`✅ Com nome padrão "FORNECEDOR ": ${fornecedoresValidos.length}`);
  console.log(`🚫 Ignorados por nome fora do padrão: ${fornecedoresIgnorados.length}`);

  if (fornecedoresIgnorados.length > 0) {
    console.log(`📋 Exemplos de nomes ignorados:`);
    console.table(fornecedoresIgnorados.slice(0, 10));
  }

  return fornecedoresValidos;
}

module.exports = {
  listarTodosFornecedores,
  normalizarFornecedor
};
