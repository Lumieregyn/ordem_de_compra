// services/fornecedorService.js
const axios = require("axios");
const { getAccessToken } = require("./tokenService");

const DEFAULT_DELAY_MS = Number(process.env.FORNECEDOR_REQUEST_DELAY_MS || 200);
const V3_BASE = process.env.TINY_V3_BASE_URL || "https://erp.tiny.com.br/public-api/v3";
const V2_BASE = process.env.TINY_V2_BASE_URL || "https://api.tiny.com.br/api2";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const isFornecedorPadrao = (nome) =>
  norm(nome).startsWith("fornecedor ");

const isPJ = (t) => String(t || "").trim().toUpperCase() === "J";

async function with429Retry(fn, { maxRetries = 3, baseDelay = 500 } = {}) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.response?.status;
      if (status === 429 && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(`[fornecedorService] 429 → retry em ${delay}ms (tentativa ${attempt + 1}/${maxRetries})`);
        await sleep(delay);
        attempt++;
        continue;
      }
      throw err;
    }
  }
}

/** ========= V3 ========= **/
async function listarV3({ pageSize = 100 } = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Token OAuth2 indisponível para Tiny v3");

  const headers = { Authorization: `Bearer ${token}` };
  const endpoint = `${V3_BASE}/contatos`;

  const map = new Map();
  let page = 1;

  while (true) {
    const resp = await with429Retry(() =>
      axios.get(endpoint, {
        headers,
        params: { page, limit: pageSize, tipo: "J", nome: "FORNECEDOR" },
        validateStatus: () => true
      })
    );

    const itens = resp.data?.itens || resp.data?.data?.itens || [];
    if (!Array.isArray(itens) || itens.length === 0) break;

    for (const raw of itens) {
      const id = raw.id ?? raw.ID ?? raw.codigo ?? raw.idCadastro;
      const nome = raw.nome ?? raw.razaoSocial ?? raw.razaosocial ?? raw.name;
      const tipoPessoa = raw.tipoPessoa ?? raw.tipo_pessoa ?? raw.pessoa ?? raw.tipo ?? raw.type;

      if (!id || !nome) continue;
      if (!isPJ(tipoPessoa) || !isFornecedorPadrao(nome)) continue;

      map.set(String(id), { id: String(id), nome, tipoPessoa: "J" });
    }

    if (itens.length < pageSize) break;
    page++;
    if (DEFAULT_DELAY_MS > 0) await sleep(DEFAULT_DELAY_MS);
  }

  return Array.from(map.values());
}

/** ========= V2 (fallback) ========= **/
async function listarV2({ pageSize = 100 } = {}) {
  const token = process.env.TINY_API_TOKEN;
  if (!token) throw new Error("TINY_API_TOKEN não definido para fallback v2.");

  const url = `${V2_BASE}/fornecedores.pesquisa.php`;
  const map = new Map();
  let pagina = 1;

  while (true) {
    const resp = await with429Retry(() =>
      axios.get(url, {
        params: { token, formato: "json", pagina, nome: "FORNECEDOR " },
        validateStatus: () => true
      })
    );

    const lista = resp.data?.retorno?.fornecedores || [];
    if (!Array.isArray(lista) || lista.length === 0) break;

    for (const item of lista) {
      const f = item?.fornecedor || item;
      const id = f?.id ?? f?.ID ?? f?.codigo ?? f?.idCadastro;
      const nome = f?.nome ?? f?.razaoSocial ?? f?.razaosocial;
      const tipoPessoa = f?.tipoPessoa ?? f?.tipo_pessoa ?? f?.pessoa ?? f?.tipo ?? f?.type;
      if (!id || !nome) continue;

      if (isPJ(tipoPessoa) && isFornecedorPadrao(nome)) {
        if (!map.has(String(id))) map.set(String(id), { id: String(id), nome, tipoPessoa: "J" });
      }
    }

    const ultimaPagina = resp.data?.retorno?.pagina?.ultima === "true";
    if (ultimaPagina) break;

    if (lista.length < pageSize) break;
    pagina++;
    if (DEFAULT_DELAY_MS > 0) await sleep(DEFAULT_DELAY_MS);
  }

  return Array.from(map.values());
}

/** ========= Verificação V3 por ID (garante que é “fornecedor” válido) ========= **/
async function verificarFornecedorV3(id) {
  try {
    const token = await getAccessToken();
    if (!token) return false;
    const resp = await with429Retry(() =>
      axios.get(`${V3_BASE}/contatos/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: () => true
      })
    );

    const c = resp.data || {};
    // heurísticas: alguns ambientes trazem flags diferentes
    const ehFornecedor =
      c?.ehFornecedor === true ||
      c?.categorias?.some?.((x) => norm(x?.nome).includes('fornecedor')) ||
      norm(c?.tipoCadastro || '').includes('fornecedor') ||
      norm(c?.papel || '').includes('fornecedor');

    const tipoPessoa = c?.tipoPessoa || c?.tipo || c?.pessoa;
    return resp.status === 200 && isPJ(tipoPessoa) && ehFornecedor;
  } catch {
    return false;
  }
}

/** ========= Orquestrador + Saneamento ========= **/
async function listarTodosFornecedoresUnificado(options = {}) {
  let lista = [];
  try {
    lista = await listarV3(options);
  } catch (e) {
    console.warn(`[fornecedorService] Falha na V3, usando V2. Motivo: ${e?.message || e}`);
    lista = await listarV2(options);
  }

  // Dedup + normalização forte do nome
  const byId = new Map();
  for (const f of lista) {
    byId.set(String(f.id), {
      ...f,
      nome: f.nome?.replace(/\s+/g, ' ').trim()
    });
  }

  // Valida IDs via V3 (só para os que forem usados depois; aqui já filtramos o óbvio)
  const candidatos = Array.from(byId.values());

  // Opcional: validação proativa de todos (pode deixar true/false via env)
  if (process.env.VALIDAR_FORNECEDOR_V3 === 'true') {
    const validados = [];
    for (const f of candidatos) {
      const ok = await verificarFornecedorV3(f.id);
      if (ok) validados.push(f);
    }
    return validados;
  }

  return candidatos;
}

module.exports = {
  listarTodosFornecedoresUnificado,
  _internals: { listarV3, listarV2, verificarFornecedorV3 }
};
