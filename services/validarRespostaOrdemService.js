// services/validarRespostaOrdemService.js
const { enviarWhatsappErro } = require('./whatsAppService');
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Usa IA para decidir se uma mensagem de alerta/erro/sucesso deve ser enviada no WhatsApp.
 * O prompt já trata do falso positivo: se o único erro for conta contábil (parcelas[0].contaContabil.id),
 * NÃO é erro crítico e a OC foi gerada.
 */
async function analisarComIA(data, numeroPedido, marca, fornecedor, contextoExtra = '') {
  const detalhes = data?.retorno?.detalhes || data?.retorno?.erros || 'Sem detalhes';
  const mensagem = data?.retorno?.mensagem || '';
  const status = data?.retorno?.status || '';
  const idOrdem = data?.retorno?.ordem_compra?.id || '';

  // prompt reforçado para IA
  const prompt = `Você é um sistema de auditoria automatizada para Ordens de Compra do Tiny ERP.
Recebe sempre respostas da API, que podem indicar sucesso ou erro. Muitas vezes a OC foi criada, mesmo se o único erro retornado for do tipo 'parcelas[0].contaContabil.id' (Conta contábil não encontrada), o que NÃO deve ser considerado erro crítico.
Avalie sempre como um especialista em integrações Tiny: só envie mensagem de erro caso REALMENTE a OC não tenha sido gerada. Se só existir esse erro de conta contábil, considere SUCESSO (não é erro real).

Se a OC foi gerada, responda apenas "SIM".
Se não foi gerada, responda apenas "NAO".

Resumo do contexto:
${contextoExtra}

Pedido: ${numeroPedido || '[indefinido]'}
Marca: ${marca || '[indefinida]'}
Fornecedor: ${fornecedor?.nome || '[desconhecido]'}
Status: ${status}
Mensagem: ${mensagem}
ID OC: ${idOrdem}
Detalhes: ${JSON.stringify(detalhes)}
`;
  try {
    const resposta = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.05,
    });
    return resposta.choices[0]?.message?.content?.toLowerCase().includes('sim');
  } catch (e) {
    console.warn('⚠️ Falha ao consultar IA, fallback para heurística:', e.message);
    return false;
  }
}

async function validarRespostaOrdem(data, numeroPedido, marca, fornecedor, contextoExtra = '') {
  // Aceita contexto extra (opcional, pode ser usado para "nenhum fornecedor identificado" etc)
  const detalhesRaw = data?.retorno?.erros || data?.retorno?.detalhes;
  let detalhes = [];
  if (Array.isArray(detalhesRaw)) {
    detalhes = detalhesRaw;
  } else if (typeof detalhesRaw === 'object' && detalhesRaw !== null) {
    detalhes = [detalhesRaw];
  }
  const idOrdem = data?.retorno?.ordem_compra?.id;
  const status = data?.retorno?.status;
  const mensagem = data?.retorno?.mensagem;

  // Toda decisão passa pela IA!
  const sucessoIA = await analisarComIA(data, numeroPedido, marca, fornecedor, contextoExtra);

  if (idOrdem || sucessoIA) {
    console.log(`✅ OC criada com sucesso (ID: ${idOrdem || 'N/A'}, status: '${status}')`);
    if (mensagem || detalhes.length > 0) {
      console.log('[OC ℹ️] Mensagem adicional da Tiny:', { mensagem, detalhes });
    }
    const texto = `✅ Ordem de Compra criada com sucesso\nPedido: ${numeroPedido || '[indefinido]'}\nMarca: ${marca || '[indefinida]'}\nFornecedor: ${fornecedor?.nome || '[desconhecido]'}`;
    try {
      await enviarWhatsappErro(texto);
    } catch (e) {
      console.warn('⚠️ Falha ao enviar alerta de sucesso (ignorado):', e.message);
    }
    return true;
  }

  // Decisão IA: erro real
  console.error('❌ Falha na criação da OC via API Tiny:', {
    status,
    erros: detalhes.length > 0 ? detalhes : 'Sem detalhes de erro',
    ordem_compra: data?.retorno?.ordem_compra,
  });
  const erroTexto = `🚨 Falha ao criar Ordem de Compra\nPedido: ${numeroPedido || '[indefinido]'}\nMarca: ${marca || '[indefinida]'}\nMotivo: ${mensagem || 'Sem mensagem'}\nDetalhes: ${JSON.stringify(detalhes)}`;
  await enviarWhatsappErro(erroTexto);
  return false;
}

module.exports = { validarRespostaOrdem };
