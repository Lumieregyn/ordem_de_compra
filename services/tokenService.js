const { createClient } = require('redis');
const axios = require('axios');

const redis = createClient({ url: process.env.REDIS_URL });
redis.on('error', err => console.error('❌ Erro no Redis:', err));

const TOKEN_KEY = 'tiny:token';
// 10 anos em ms
const LONG_EXP_MS = 10 * 365 * 24 * 60 * 60 * 1000;

/** Conecta ao Redis se ainda não estiver conectado */
async function conectarRedis() {
  if (!redis.isOpen) await redis.connect();
}

/** Salva token no Redis com expiração "muito longa" */
async function salvarToken(tokenData) {
  await conectarRedis();

  // Mantém dados originais, mas força um expires_at longínquo
  const toSave = {
    ...tokenData,
    expires_at: Date.now() + LONG_EXP_MS
  };

  await redis.set(TOKEN_KEY, JSON.stringify(toSave));
  console.log('💾 Token salvo no Redis com expiração (fake) em:', new Date(toSave.expires_at).toISOString());
}

/** Recupera token do Redis (completo) */
async function lerToken() {
  await conectarRedis();
  const raw = await redis.get(TOKEN_KEY);
  return raw ? JSON.parse(raw) : null;
}

/** Tenta renovar usando refresh_token (mantido para uso manual/futuro) */
async function renovarToken(tokenAtual) {
  console.log('🔄 Tentando renovar com refresh_token...');
  try {
    const response = await axios.post(
      'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        refresh_token: tokenAtual?.refresh_token,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        validateStatus: () => true,
        timeout: 15000
      }
    );

    if (!response.data?.access_token) {
      console.error('❌ Erro ao renovar token:', response.status, response.data);
      return null;
    }

    await salvarToken(response.data);
    return response.data.access_token;

  } catch (err) {
    console.error('❌ Falha ao renovar token:', err.message);
    return null;
  }
}

/**
 * Retorna SEMPRE o access_token atual (não depende mais de expires_at).
 * Se não houver token salvo, tenta renovar; se não der, retorna null.
 */
async function getAccessToken() {
  const token = await lerToken();
  if (token?.access_token) return token.access_token;
  return await renovarToken(token);
}

module.exports = {
  salvarToken,
  getAccessToken
};
