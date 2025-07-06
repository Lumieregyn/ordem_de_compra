// services/tinyUtils.js

/**
 * Utilitários globais usados nos serviços integrados com a Tiny.
 */

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizarTexto(txt) {
  return txt
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .trim();
}

const TINY_API_V3_BASE = 'https://erp.tiny.com.br/public-api/v3';

module.exports = {
  delay,
  normalizarTexto,
  TINY_API_V3_BASE
};
