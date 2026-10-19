"use strict";

require("dotenv").config();

const {
    buscarClienteDev
} = require("../src/services/clientesIntegracao");

const {
    criarPagamentoSaida,
    aprovarPagamentoSaida,
    buscarPagamentoSaidaPorId
} = require("../src/services/pagamentosSaida");

const {
    prepararPagamentoBB,
    enviarPagamentoBB,
    aplicarRetornoPagamentoBB
} = require("../src/services/bbPagamentosLoteService");

function dataFutura(dias = 7) {
    const data = new Date();
    data.setDate(data.getDate() + dias);
    return data.toISOString().slice(0, 10);
}

function numeroRequisicaoTeste() {
    return 2000000 + (Date.now() % 7000000);
}

async function main() {
    if (
        String(process.env.BB_PAGAMENTOS_SEND_ENABLED || "false")
            .trim()
            .toLowerCase() !== "false"
    ) {
        throw new Error(
            "Por segurança, BB_PAGAMENTOS_SEND_ENABLED precisa estar false neste teste"
        );
    }

    const cliente = await buscarClienteDev();
    const sufixo = Date.now();

    console.log("[INFO] Criando pagamento BB de teste...");

    const criado = await criarPagamentoSaida(
        {
            banco: "bb",
            empresa: "FIT-HML",
            id_titulo: `FORN-BB-V111-${sufixo}`,
            tipo_pagamento: "TRANSFERENCIA_BANCARIA",
            valor: 19.91,
            data_pagamento: dataFutura(7),
            favorecido: {
                nome: "FORNECEDOR TESTE BB V111",
                documento: "12345678000110",
                numero_compe: "1",
                ispb: "0",
                agencia: "4321",
                conta: "98765",
                digito_conta: "X"
            },
            dados_pagamento: {
                numero_requisicao: numeroRequisicaoTeste(),
                tipo_pagamento_bb: 126,
                descricao_transferencia: "Teste V1.11 sem envio"
            }
        },
        `BB-PAGAMENTOS-V111-${sufixo}`,
        cliente.id
    );

    if (criado.pagamento.status !== "AGUARDANDO_APROVACAO") {
        throw new Error(`Status inicial inesperado: ${criado.pagamento.status}`);
    }

    console.log(`[OK] Criado: ${criado.pagamento.id}`);

    const aprovado = await aprovarPagamentoSaida(
        criado.pagamento.id,
        "TESTE_AUTOMATIZADO_V111",
        cliente.id
    );

    if (aprovado.pagamento.status !== "PRONTO_PARA_ENVIO") {
        throw new Error(
            `Aprovação não chegou em PRONTO_PARA_ENVIO: ${aprovado.pagamento.status}`
        );
    }

    console.log("[OK] Aprovação interna chegou a PRONTO_PARA_ENVIO.");

    const preparado = await prepararPagamentoBB({
        pagamentoId: criado.pagamento.id,
        clienteIntegracaoId: cliente.id
    });

    if (preparado.envio_habilitado !== false) {
        throw new Error("Envio deveria permanecer desabilitado");
    }

    console.log("[OK] Payload BB foi preparado após aprovação.");
    console.log("[OK] Envio bancário continua desabilitado.");

    let bloqueado = false;

    try {
        await enviarPagamentoBB({
            pagamentoId: criado.pagamento.id,
            clienteIntegracaoId: cliente.id
        });
    } catch (erro) {
        bloqueado = erro.code === "FIT_BB_PAGAMENTOS_ENVIO_DESABILITADO";
    }

    if (!bloqueado) {
        throw new Error(
            "Tentativa de envio não foi bloqueada pela trava de segurança"
        );
    }

    console.log("[OK] POST real foi bloqueado antes de usar certificado/mTLS.");

    const simulado = await aplicarRetornoPagamentoBB({
        pagamentoId: criado.pagamento.id,
        clienteIntegracaoId: cliente.id,
        modalidade: "TRANSFERENCIA_BANCARIA",
        origem: "LANCAMENTO",
        simulado: true,
        retorno: {
            id: 90001210123456000,
            estadoPagamento: "PAGO",
            codigoAutenticacaoPagamento: "TESTE-V111",
            dataPagamento: 17042026,
            valorPagamento: 19.91
        }
    });

    if (
        simulado.persistido !== false ||
        simulado.normalizado.status_fit !== "PAGO"
    ) {
        throw new Error("Simulação de retorno não se comportou como esperado");
    }

    const depois = await buscarPagamentoSaidaPorId(
        criado.pagamento.id,
        cliente.id
    );

    if (depois.status !== "PRONTO_PARA_ENVIO") {
        throw new Error(
            `Simulação alterou indevidamente o financeiro local: ${depois.status}`
        );
    }

    console.log("[OK] Retorno PAGO simulado foi interpretado, mas não persistido.");
    console.log("[OK] Registro local permaneceu PRONTO_PARA_ENVIO.");
    console.log("[OK] Nenhum pagamento foi enviado ao Banco do Brasil.");
    console.log("BB_PAGAMENTOS_FLUXO_APROVACAO_V111_OK");
}

main().catch(erro => {
    console.error("TESTE_BB_PAGAMENTOS_FLUXO_APROVACAO_V111_FALHOU");
    console.error(`Mensagem: ${erro.message}`);
    console.error(`Código: ${erro.code || "SEM_CODIGO"}`);
    process.exitCode = 1;
});
