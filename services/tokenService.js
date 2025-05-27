// services/tokenService.js

let accessToken = null;

/**
 * Define o token de acesso da API Tiny v3.
 * @param {string} token
 */
function setAccessToken(token) {
  accessToken = token;
}

/**
 * Retorna o token de acesso atual.
 * @returns {string|null}
 */
function getAccessToken() {
  return accessToken;
}

module.exports = {
  setAccessToken,
  getAccessToken,
};
