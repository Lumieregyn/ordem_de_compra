const { enviarWhatsappErro } = require('./whatsAppService');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function analisarSeOcFoiSucessoViaIA(numeroPedido, marca, fornecedor, detalhesErro) {
  const prompt = `Um sistema automatizado tentou criar uma Ordem de Compra (OC) no Tiny ERP e recebeu o seguinte erro:

${JSON.stringify(detalhesErro, null, 2)}

Com base nisso, a OC pode ser considerada criada com sucesso e o erro é irrelevante? Responda apenas "SIM" ou "NAO".`;

  try {
    const resposta = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo-instruct',
      prompt,
      max_tokens: 3,
      temperature: 0
    });

    const texto = resposta.choices?.[0]?.text?.trim().toUpperCase();
    return texto === 'SIM';
  } catch (e) {
    console.error('⚠️ Falha na IA para interpretar erro da OC:', e.message);
    return false;
  }
}

async function validarRespostaOrdem(data, numeroPedido, marca, fornecedor) {
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

  // Verifica com IA se erro é irrelevante
  const erroIgnoradoViaIA = !idOrdem && detalhes.length > 0
    ? await analisarSeOcFoiSucessoViaIA(numeroPedido, marca, fornecedor, detalhes)
    : false;

  if (idOrdem || erroIgnoradoViaIA) {
    console.log(`✅ OC criada com sucesso (ID: ${idOrdem || 'N/A'}, status: '${status}')`);

    if (erroIgnoradoViaIA && !idOrdem) {
      console.log('⚠️ Erro ignorado via IA. Considerando a OC como criada com sucesso.');
    }

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

  // Se estrutura ausente sem erro conhecido, loga como falha
  if (!data || !data.retorno) {
    const erroCampoContabil = detalhes.some(e => e?.campo === 'parcelas[0].contaContabil.id');
    if (!erroCampoContabil) {
      console.error('❌ Resposta inválida da API Tiny: estrutura ausente');
      await enviarWhatsappErro(`🚨 Erro na resposta da API Tiny\nPedido: ${numeroPedido || '[indefinido]'}\nMarca: ${marca || '[indefinida]'}\nMotivo: Estrutura ausente`);
    }
    return false;
  }

  console.error('❌ Falha na criação da OC via API Tiny:', {
    status,
    erros: detalhes.length > 0 ? detalhes : 'Sem detalhes de erro',
    ordem_compra: data.retorno?.ordem_compra,
  });

  const erroTexto = `🚨 Falha ao criar Ordem de Compra\nPedido: ${numeroPedido || '[indefinido]'}\nMarca: ${marca || '[indefinida]'}\nMotivo: ${mensagem || 'Sem mensagem'}\nDetalhes: ${JSON.stringify(detalhes)}`;

  await enviarWhatsappErro(erroTexto);

  return false;
}

module.exports = { validarRespostaOrdem };
