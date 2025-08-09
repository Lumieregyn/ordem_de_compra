const { createClient } = require('redis');
const axios = require('axios');

const redis = createClient({ url: process.env.REDIS_URL });
redis.on('error', err => console.error('❌ Erro no Redis:', err));

const TOKEN_KEY = 'tiny:token';

// Renova 10 min antes de expirar (janela de segurança)
const RENOVA_ANTES_MS = 10 * 60 * 1000;
// Tentativas de refresh com backoff exponencial simples
const MAX_TENTATIVAS_REFRESH = 3;
const BACKOFF_BASE_MS = 1500;

// Evita tempestade de refresh quando várias requisições chegarem juntas
let refreshPromise = null;

async function conectarRedis() {
  if (!redis.isOpen) await redis.connect();
}

async function salvarToken(tokenData) {
  await conectarRedis();

  const now = Date.now();
  const accessExpiresAt = now + (Number(tokenData.expires_in || 0) * 1000);

  // Se o IdP devolver refresh_expires_in, guardamos para diagnóstico
  const refreshExpiresAt = tokenData.refresh_expires_in != null
    ? now + (Number(tokenData.refresh_expires_in) * 1000)
    : null;

  const toSave = {
    ...tokenData,
    expires_at: accessExpiresAt,
    ...(refreshExpiresAt ? { refresh_expires_at: refreshExpiresAt } : {})
  };

  await redis.set(TOKEN_KEY, JSON.stringify(toSave));
  console.log(
    '💾 Salva de token. expira_em:', new Date(accessExpiresAt).toISOString(),
    refreshExpiresAt ? `| atualização_expira_em: ${new Date(refreshExpiresAt).toISOString()}` : ''
  );
}

async function lerToken() {
  await conectarRedis();
  const raw = await redis.get(TOKEN_KEY);
  return raw ? JSON.parse(raw) : null;
}

async function delay(ms){ return new Promise(r => setTimeout(r, ms)); }

async function renovarToken(tokenAtual) {
  if (!tokenAtual?.refresh_token) {
    console.error('❌ Sem refresh_token para renovar.');
    return null;
  }

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_REFRESH; tentativa++) {
    try {
      console.log(`🔄 Renovando access_token (tentativa ${tentativa}/${MAX_TENTATIVAS_REFRESH})...`);

      const response = await axios.post(
        'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: process.env.CLIENT_ID,
          client_secret: process.env.CLIENT_SECRET,
          refresh_token: tokenAtual.refresh_token,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 15000,
          validateStatus: () => true,
        }
      );

      const ok = response.status >= 200 && response.status < 300 && response.data?.access_token;
      if (!ok) {
        console.warn('⚠️ Falha no refresh:', response.status, response.data);
        if (response.status === 400 || response.status === 401) break; // refresh inválido/expirado
      } else {
        // alguns provedores ROTACIONAM o refresh_token — salve tudo que vier
        await salvarToken(response.data);
        return response.data.access_token;
      }
    } catch (err) {
      console.warn(`⏳ Erro no refresh (tentativa ${tentativa}):`, err.message);
    }

    await delay(BACKOFF_BASE_MS * Math.pow(2, tentativa - 1));
  }

  // sinalize necessidade de /auth manual se quiser (WhatsApp, etc.)
  return null;
}

/**
 * Retorna um access_token válido:
 * - se faltar > RENOVA_ANTES_MS, usa o atual
 * - senão, executa/aguarda um refresh (dedupe para concorrência)
 */
async function getAccessToken() {
  const token = await lerToken();
  if (!token) return null;

  const agora = Date.now();
  const expiraEm = token.expires_at || 0;

  // ainda tem folga? usa o token atual
  if (agora < expiraEm - RENOVA_ANTES_MS) {
    return token.access_token;
  }

  // precisa renovar — deduplica entre chamadas simultâneas
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const novo = await renovarToken(token);
      refreshPromise = null;
      return novo;
    })();
  }
  return await refreshPromise;
}

module.exports = { salvarToken, getAccessToken, lerToken };
