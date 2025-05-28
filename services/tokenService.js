const axios = require('axios');
const qs = require('qs');

let accessToken = null;

async function authCallback(code) {
  if (!code) throw new Error('Código de autorização ausente');

  const payload = qs.stringify({
    grant_type: 'authorization_code',
    code,
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    redirect_uri: process.env.REDIRECT_URI
  });

  const config = {
    method: 'post',
    url: 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: payload
  };

  const response = await axios(config);
  accessToken = response.data.access_token;

  // Se quiser persistir esse token em Mongo futuramente, aqui seria o lugar
  console.log(`✅ Token obtido com sucesso. Expira em ${response.data.expires_in} segundos.`);
}

/**
 * Retorna o token salvo em memória
 */
function getAccessToken() {
  return accessToken;
}

module.exports = {
  authCallback,
  getAccessToken
};
