const axios = require('axios');

const BASE_URL = 'https://api.tiny.com.br/api2/fornecedores.pesquisa.php';
const API_TOKEN = process.env.TINY_API_TOKEN;
const DELAY_MS = 800;

// 🧹 Normaliza o nome do fornecedor para comparação
function normalizarFornecedor(nome) {
  return nome
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Remove acentos
    .replace(/[^a-zA-Z0-9\s]/g, '')  // Remove símbolos
    .replace(/\b(FORNECEDOR|LTDA|ME|URGENTE)\b/gi, '')  // Remove ruídos
    .replace(/\s+/g, ' ')  // Normaliza espaços
    .trim()
    .toLowerCase();
}

async function listarTodosFornecedores() {
  const fornecedoresMap = new Map(); // Para evitar duplicatas
  const fornecedoresIgnorados = [];
  let pagina = 1;
  let totalBuscados = 0;

  while (true) {
    const url = `${BASE_URL}?token=${API_TOKEN}&formato=json&pagina=${pagina}&tipo=J`;

    try {
      const response = await axios.get(url);
      const lista = response.data?.retorno?.fornecedores || [];

      console.log(`📄 Página ${pagina}: ${lista.length} fornecedores`);

      if (lista.length === 0) break;

      for (const item of lista) {
        const f = item?.fornecedor;
        if (!f?.id || !f?.nome || f?.tipoPessoa !== 'J') continue;

        totalBuscados++;

        const nomeUpper = f.nome.toUpperCase();
        const jaExiste = fornecedoresMap.has(f.id);

        if (nomeUpper.startsWith('FORNECEDOR ')) {
          if (!jaExiste) {
            fornecedoresMap.set(f.id, {
              id: f.id,
              nomeOriginal: f.nome,
              nomeNormalizado: normalizarFornecedor(f.nome)
            });
          }
        } else {
          fornecedoresIgnorados.push({
            id: f.id,
            nome: f.nome
          });
        }
      }

      const ultimaPagina = response.data?.retorno?.pagina?.ultima === 'true';
      if (ultimaPagina) break;

      pagina++;
      await new Promise(res => setTimeout(res, DELAY_MS));

    } catch (err) {
      console.error(`[listarTodosFornecedores] Erro na página ${pagina}:`, err.message);
      break;
    }
  }

  const fornecedoresValidos = Array.from(fornecedoresMap.values());

  console.log(`📦 Total bruto recebido: ${totalBuscados}`);
  console.log(`✅ Fornecedores válidos (com prefixo "FORNECEDOR "): ${fornecedoresValidos.length}`);
  console.log(`🚫 Ignorados por nome fora do padrão: ${fornecedoresIgnorados.length}`);

  if (fornecedoresIgnorados.length > 0) {
    console.log('📋 Exemplos de ignorados:');
    console.table(fornecedoresIgnorados.slice(0, 5));
  }

  return fornecedoresValidos;
}

module.exports = {
  listarTodosFornecedores,
  normalizarFornecedor
};
