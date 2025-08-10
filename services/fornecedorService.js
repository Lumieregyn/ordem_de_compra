// services/fornecedorService.js
const axios = require("axios");
const qs = require("querystring");
const { getAccessToken } = require("./tokenService");

const DEFAULT_DELAY_MS = Number(process.env.FORNECEDOR_REQUEST_DELAY_MS || 200);
// ✔ usar a mesma base da V3 que o resto do projeto
const V3_BASE = process.env.TINY_V3_BASE_URL || "https://erp.tiny.com.br/public-api/v3";
// ✔ base V2 correta
const V2_BASE = process.env.TINY_V2_BASE_URL || "https://api.tiny.com.br/api2";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isFornecedorPadrao = (nome) =>
  !!nome && String(nome).trim().toUpperCase().startsWith("FORNECEDOR ");
const isPessoaJuridica = (tipoPessoa) =>
  !!tipoPessoa && String(tipoPessoa).trim().toUpperCase() === "J";

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

/** ===================== V3 (contatos) ===================== **/
async function listarV3({ pageSize = 100 } = {}) {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error("Token OAuth2 indisponível para Tiny v3");

  const headers = { Authorization: `Bearer ${accessToken}` };

  // ✔ igual sua rota antiga: /contatos com filtros tipo/nome
  const endpoint = `${V3_BASE}/contatos`;

  const fornecedoresMap = new Map();
  let page = 1;

  while (true) {
    const resp = await with429Retry(() =>
      axios.get(endpoint, {
        headers,
        params: {
          page,
          limit: pageSize,
          tipo: "J",
          nome: "FORNECEDOR"
        },
        validateStatus: () => true
      })
    );

    // no seu projeto a resposta vem como { itens: [...] }
    const itens = resp.data?.itens || resp.data?.data?.itens || [];
    if (!Array.isArray(itens) || itens.length === 0) break;

    for (const raw of itens) {
      const id = raw.id ?? raw.ID ?? raw.idCadastro ?? raw.codigo;
      const nome = raw.nome ?? raw.razaoSocial ?? raw.razaosocial ?? raw.name;
      const tipoPessoa =
        raw.tipoPessoa ?? raw.tipo_pessoa ?? raw.pessoa ?? raw.tipo ?? raw.type ?? raw?.document?.tipoPessoa;

      if (!id) continue;
      if (isPessoaJuridica(tipoPessoa) && isFornecedorPadrao(nome)) {
        const {
          id: _i, ID: _I, idCadastro, codigo, razaoSocial, razaosocial, tipo_pessoa, pessoa, type, name, ...resto
        } = raw || {};
        fornecedoresMap.set(String(id), { id: String(id), nome, tipoPessoa: "J", ...resto });
      }
    }

    if (itens.length < pageSize) break;
    page++;
    if (DEFAULT_DELAY_MS > 0) await sleep(DEFAULT_DELAY_MS);
  }

  return Array.from(fornecedoresMap.values());
}

/** ===================== V2 (fallback via GET) ===================== **/
async function listarV2({ pageSize = 100 } = {}) {
  const token = process.env.TINY_API_TOKEN;
  if (!token) throw new Error("TINY_API_TOKEN não definido para fallback v2.");

  const url = `${V2_BASE}/fornecedores.pesquisa.php`;
  const fornecedoresMap = new Map();
  let pagina = 1;

  while (true) {
    // ✔ usar GET (seu código que funciona usa GET)
    const response = await with429Retry(() =>
      axios.get(url, {
        params: {
          token,
          formato: "json",
          pagina,
          nome: "FORNECEDOR " // inclui espaço para prefixo
        },
        validateStatus: () => true
      })
    );

    const lista = response.data?.retorno?.fornecedores || [];
    if (!Array.isArray(lista) || lista.length === 0) break;

    for (const item of lista) {
      const f = item?.fornecedor || item;
      const id = f?.id ?? f?.ID ?? f?.codigo ?? f?.idCadastro;
      const nome = f?.nome ?? f?.razaoSocial ?? f?.razaosocial;
      const tipoPessoa = f?.tipoPessoa ?? f?.tipo_pessoa ?? f?.pessoa ?? f?.tipo ?? f?.type;
      if (!id) continue;

      if (isPessoaJuridica(tipoPessoa) && isFornecedorPadrao(nome)) {
        const { id: _i, ID: _I, codigo, idCadastro, razaoSocial, razaosocial, tipo_pessoa, pessoa, type, ...resto } =
          f || {};
        if (!fornecedoresMap.has(String(id))) {
          fornecedoresMap.set(String(id), { id: String(id), nome, tipoPessoa: "J", ...resto });
        }
      }
    }

    // se a API informar última página, respeita; senão usa heurística
    const ultimaPagina = response.data?.retorno?.pagina?.ultima === "true";
    if (ultimaPagina) break;

    if (lista.length < pageSize) break;
    pagina++;
    if (DEFAULT_DELAY_MS > 0) await sleep(DEFAULT_DELAY_MS);
  }

  return Array.from(fornecedoresMap.values());
}

/** ===================== Orquestrador ===================== **/
async function listarTodosFornecedoresUnificado(options = {}) {
  try {
    const v3 = await listarV3(options);
    return v3;
  } catch (e) {
    console.warn(
      `[fornecedorService] Falha na API v3, iniciando fallback v2. Motivo: ${e?.message || e}`
    );
  }

  const v2 = await listarV2(options);
  return v2;
}

module.exports = {
  listarTodosFornecedoresUnificado,
  _internals: { listarV3, listarV2 }
};
