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
  // Aceita tanto data.retorno quanto data direto
  const retorno = data?.retorno || data;
  const detalhes = retorno?.detalhes || retorno?.erros || 'Sem detalhes';
  const mensagem = retorno?.mensagem || '';
  const status = retorno?.status || '';
  const idOrdem = retorno?.ordem_compra?.id || retorno?.ordemCompra?.id || '';

  const prompt = `Você é um sistema de auditoria automatizada para Ordens de Compra do Tiny ERP.
Recebe respostas da API, que podem indicar sucesso ou erro. Muitas vezes a OC foi criada, mesmo se o único erro retornado for do tipo 'parcelas[0].contaContabil.id' (Conta contábil não encontrada), o que NÃO deve ser considerado erro crítico.
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
  // Aceita tanto data.retorno quanto data direto (compatível com todas respostas)
  const retorno = data?.retorno || data;
  console.log('DEBUG - RESPOSTA RECEBIDA DA TINY:', JSON.stringify(retorno, null, 2));

  const detalhesRaw = retorno?.erros || retorno?.detalhes;
  let detalhes = [];
  if (Array.isArray(detalhesRaw)) {
    detalhes = detalhesRaw;
  } else if (typeof detalhesRaw === 'object' && detalhesRaw !== null) {
    detalhes = [detalhesRaw];
  }

  const idOrdem = retorno?.ordem_compra?.id || retorno?.ordemCompra?.id;
  const status = retorno?.status;
  const mensagem = retorno?.mensagem;

  // 1️⃣ CURTO-CIRCUITO FALSO POSITIVO: só erro de conta contábil = SUCESSO (SEM IA)
  const erroSomenteContaContabil = detalhes.length > 0 && detalhes.every(
    err => err?.campo === 'parcelas[0].contaContabil.id'
  );
  if (erroSomenteContaContabil) {
    console.log('✅ OC criada com sucesso (falso positivo de conta contábil)');
    const texto = `✅ Ordem de Compra criada com sucesso
Pedido: ${numeroPedido || '[indefinido]'}
Marca: ${marca || '[indefinida]'}
Fornecedor: ${fornecedor?.nome || '[desconhecido]'}
[Ignorado erro de conta contábil]`;
    try {
      await enviarWhatsappErro(texto);
    } catch (e) {
      console.warn('⚠️ Falha ao enviar alerta de sucesso (ignorado):', e.message);
    }
    return true;
  }

  // 2️⃣ SE OC FOI CRIADA (tem ID), sucesso
  if (idOrdem) {
    console.log(`✅ OC criada com sucesso (ID: ${idOrdem}, status: '${status}')`);
    const texto = `✅ Ordem de Compra criada com sucesso
Pedido: ${numeroPedido || '[indefinido]'}
Marca: ${marca || '[indefinida]'}
Fornecedor: ${fornecedor?.nome || '[desconhecido]'}
ID OC: ${idOrdem}`;
    try {
      await enviarWhatsappErro(texto);
    } catch (e) {
      console.warn('⚠️ Falha ao enviar alerta de sucesso (ignorado):', e.message);
    }
    return true;
  }

  // 3️⃣ PARA OUTROS CASOS: usa IA para decidir!
  const sucessoIA = await analisarComIA(data, numeroPedido, marca, fornecedor, contextoExtra);
  if (sucessoIA) {
    console.log(`✅ OC criada com sucesso (decisão IA)`);
    const texto = `✅ Ordem de Compra criada com sucesso
Pedido: ${numeroPedido || '[indefinido]'}
Marca: ${marca || '[indefinida]'}
Fornecedor: ${fornecedor?.nome || '[desconhecido]'}
[IA considerou sucesso]`;
    try {
      await enviarWhatsappErro(texto);
    } catch (e) {
      console.warn('⚠️ Falha ao enviar alerta de sucesso (ignorado):', e.message);
    }
    return true;
  }

  // 4️⃣ SE NÃO É SUCESSO, ENVIA ERRO CRÍTICO
  console.error('❌ Falha na criação da OC via API Tiny:', {
    status,
    erros: detalhes.length > 0 ? detalhes : 'Sem detalhes de erro',
    ordem_compra: retorno?.ordem_compra || retorno?.ordemCompra,
  });
  const erroTexto = `🚨 Falha ao criar Ordem de Compra
Pedido: ${numeroPedido || '[indefinido]'}
Marca: ${marca || '[indefinida]'}
Motivo: ${mensagem || 'Sem mensagem'}
Detalhes: ${JSON.stringify(detalhes)}`;
  await enviarWhatsappErro(erroTexto);
  return false;
}

module.exports = { validarRespostaOrdem };
