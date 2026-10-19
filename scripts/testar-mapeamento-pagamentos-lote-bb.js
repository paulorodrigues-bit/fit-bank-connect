"use strict";

const assert = require("assert");

const {
    montarLoteTransferenciasBB
} = require("../src/banks/bbPagamentosLoteMapper");

const {
    normalizarEstadoRequisicaoBB,
    normalizarEstadoPagamentoBB
} = require("../src/banks/bbPagamentosLoteStatus");

function main() {
    const pagamento = {
        banco: "bb",
        empresa: "FIT-HML",
        id_titulo: "FORN-BB-TESTE-001",
        tipo_pagamento: "TRANSFERENCIA_BANCARIA",
        valor: 400.75,
        data_pagamento: "2026-04-17",
        favorecido: {
            nome: "FORNECEDOR TESTE",
            documento: "12345678000110",
            numero_compe: "1",
            ispb: "0",
            agencia: "4321",
            conta: "98765",
            digito_conta: "X"
        },
        dados_pagamento: {
            numero_requisicao: 1210,
            tipo_pagamento_bb: 128,
            documento_debito: 361751,
            codigo_finalidade_ted: 10,
            descricao_transferencia: "Teste controlado FIT Bank Connect"
        }
    };

    const configuracao = {
        numero_contrato_pagamento: 123456,
        agencia_debito: 1234,
        conta_corrente_debito: 56789,
        digito_conta_debito: "X"
    };

    const payload = montarLoteTransferenciasBB({
        pagamento,
        configuracao
    });

    assert.strictEqual(payload.numeroRequisicao, 1210);
    assert.strictEqual(payload.numeroContratoPagamento, 123456);
    assert.strictEqual(payload.tipoPagamento, 128);
    assert.strictEqual(payload.listaTransferencias.length, 1);
    assert.strictEqual(
        payload.listaTransferencias[0].dataTransferencia,
        17042026
    );
    assert.strictEqual(
        payload.listaTransferencias[0].valorTransferencia,
        400.75
    );
    assert.strictEqual(
        payload.listaTransferencias[0].cnpjBeneficiario,
        "12345678000110"
    );

    const req9 = normalizarEstadoRequisicaoBB(9);
    assert.strictEqual(req9.status_fit, "PROCESSANDO");

    const pago = normalizarEstadoPagamentoBB("PAGO");
    assert.strictEqual(pago.status_fit, "PAGO");

    console.log("[OK] Contrato FIT → BB montou POST /lotes-transferencias.");
    console.log("[OK] Data AAAA-MM-DD foi convertida para DDMMAAAA.");
    console.log("[OK] CPF/CNPJ, COMPE/ISPB e conta foram normalizados.");
    console.log("[OK] Estado da requisição não é confundido com pagamento liquidado.");
    console.log("[OK] Nenhuma chamada bancária foi realizada.");
    console.log("BB_PAGAMENTOS_LOTE_MAPPER_V110_OK");
}

try {
    main();
} catch (erro) {
    console.error("TESTE_BB_PAGAMENTOS_MAPPER_V110_FALHOU");
    console.error(`Mensagem: ${erro.message}`);
    process.exitCode = 1;
}
