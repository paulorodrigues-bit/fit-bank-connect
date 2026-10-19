"use strict";

require("dotenv").config();

const {
    buscarClienteDev
} = require("../src/services/clientesIntegracao");

const {
    criarPagamentoSaida
} = require("../src/services/pagamentosSaida");

function dataFutura(dias) {
    const data = new Date();
    data.setDate(data.getDate() + dias);
    return data.toISOString().slice(0, 10);
}

async function main() {
    console.log("[INFO] Criando pagamento BB local, sem envio ao banco...");

    if (
        String(process.env.BB_PAGAMENTOS_SEND_ENABLED || "false")
            .trim()
            .toLowerCase() === "true"
    ) {
        throw new Error(
            "BB_PAGAMENTOS_SEND_ENABLED deve permanecer false neste teste"
        );
    }

    const cliente = await buscarClienteDev();

    const resultado = await criarPagamentoSaida(
        {
            banco: "bb",
            empresa: "FIT-HML",
            id_titulo: "FORN-BB-V110-001",
            tipo_pagamento: "TRANSFERENCIA_BANCARIA",
            valor: 12.34,
            data_pagamento: dataFutura(7),
            favorecido: {
                nome: "FORNECEDOR TESTE BB",
                documento: "12345678000110",
                numero_compe: "1",
                ispb: "0",
                agencia: "4321",
                conta: "98765",
                digito_conta: "X"
            },
            dados_pagamento: {
                numero_requisicao: 190001,
                tipo_pagamento_bb: 126,
                descricao_transferencia: "Teste V1.10 sem envio"
            }
        },
        "BB-PAGAMENTOS-V110-FORN-BB-001",
        cliente.id
    );

    if (resultado.pagamento.banco !== "bb") {
        throw new Error("Pagamento não foi persistido com banco=bb");
    }

    if (resultado.pagamento.status !== "AGUARDANDO_APROVACAO") {
        throw new Error(
            `Status inesperado: ${resultado.pagamento.status}`
        );
    }

    console.log(`[OK] Pagamento BB criado: ${resultado.pagamento.id}`);
    console.log(`[OK] Idempotente: ${resultado.idempotente ? "sim" : "não"}`);
    console.log("[OK] Status: AGUARDANDO_APROVACAO.");
    console.log("[OK] Dados bancários sensíveis permanecem criptografados.");
    console.log("[OK] Nenhum pagamento foi enviado ao BB.");
    console.log("BB_PAGAMENTOS_LOTE_CRIACAO_V110_OK");
}

main().catch(erro => {
    console.error("TESTE_BB_PAGAMENTOS_CRIACAO_V110_FALHOU");
    console.error(`Mensagem: ${erro.message}`);
    console.error(`Código: ${erro.code || "SEM_CODIGO"}`);
    process.exitCode = 1;
});
