const fs = require('fs');
const path = require('path');

const TOKEN_PATH = path.join(__dirname, '..', 'token.json');

/**
 * Salva o token completo no disco em formato JSON.
 * @param {object} tokenData - Objeto contendo access_token, expires_in, etc.
 */
function salvarToken(tokenData) {
  try {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData, null, 2), 'utf-8');
    console.log('💾 Token salvo em token.json');
  } catch (err) {
    console.error('❌ Erro ao salvar token:', err.message);
  }
}

/**
 * Lê o token atual salvo no disco.
 * Retorna apenas o access_token se estiver válido.
 */
function getAccessToken() {
  try {
    if (!fs.existsSync(TOKEN_PATH)) return null;

    const raw = fs.readFileSync(TOKEN_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return data?.access_token || null;
  } catch (err) {
    console.error('❌ Erro ao ler token:', err.message);
    return null;
  }
}

module.exports = {
  salvarToken,
  getAccessToken
};
