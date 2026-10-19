"use strict";

const assert = require("assert");

const {
    normalizarEstadoRequisicaoBB,
    normalizarEstadoPagamentoBB
} = require("../src/banks/bbPagamentosLoteStatus");

const {
    normalizarRetornoRequisicaoBB,
    normalizarRetornoLancamentoBB
} = require("../src/banks/bbPagamentosLoteRetorno");

function main() {
    const req6 = normalizarEstadoRequisicaoBB(6);
    assert.strictEqual(req6.status_fit, "PROCESSANDO");
    assert.strictEqual(req6.liquidado, false);

    const req7 = normalizarEstadoRequisicaoBB(7);
    assert.strictEqual(req7.status_fit, "REJEITADO");
    assert.strictEqual(req7.final, true);

    const consistente = normalizarEstadoPagamentoBB("CONSISTENTE");
    assert.strictEqual(consistente.status_fit, "PROCESSANDO");
    assert.strictEqual(consistente.liquidado, false);

    const pago = normalizarEstadoPagamentoBB("Pago");
    assert.strictEqual(pago.status_fit, "PAGO");
    assert.strictEqual(pago.liquidado, true);

    const naoEfetuado = normalizarEstadoPagamentoBB("NÃO EFETUADO");
    assert.strictEqual(naoEfetuado.status_fit, "REJEITADO");
    assert.strictEqual(naoEfetuado.liquidado, false);

    const retornoReq = normalizarRetornoRequisicaoBB({
        numeroRequisicao: 1210,
        estadoRequisicao: 1,
        quantidadeTransferencias: 1,
        quantidadeTransferenciasValidas: 1,
        valorTransferenciasValidas: 400.75,
        transferencias: [
            {
                identificadorTransferencia: 90001210123456000
            }
        ]
    }, "TRANSFERENCIA_BANCARIA");

    assert.strictEqual(retornoReq.status_fit, "PROCESSANDO");
    assert.strictEqual(retornoReq.liquidado, false);
    assert.strictEqual(retornoReq.ids_lancamento.length, 1);

    const retornoLanc = normalizarRetornoLancamentoBB({
        id: 90001210123456000,
        estadoPagamento: "PAGO",
        codigoAutenticacaoPagamento: "F033A03D67666112",
        dataPagamento: 17042026,
        valorPagamento: 400.75
    }, "TRANSFERENCIA_BANCARIA");

    assert.strictEqual(retornoLanc.status_fit, "PAGO");
    assert.strictEqual(retornoLanc.final, true);
    assert.strictEqual(retornoLanc.liquidado, true);
    assert.strictEqual(
        retornoLanc.id_lancamento,
        "90001210123456000"
    );

    console.log("[OK] Estado 6 PROCESSADA continua PROCESSANDO, nunca PAGO.");
    console.log("[OK] Estado 7 REJEITADA encerra como REJEITADO.");
    console.log("[OK] CONSISTENTE continua PROCESSANDO.");
    console.log("[OK] PAGO/EFETUADO é a única família que liquida o pagamento.");
    console.log("[OK] NÃO EFETUADO não sofre falso positivo por conter texto de pagamento.");
    console.log("[OK] Retornos de requisição e lançamento foram normalizados.");
    console.log("BB_PAGAMENTOS_STATUS_RETORNOS_V111_OK");
}

try {
    main();
} catch (erro) {
    console.error("TESTE_BB_PAGAMENTOS_STATUS_RETORNOS_V111_FALHOU");
    console.error(`Mensagem: ${erro.message}`);
    process.exitCode = 1;
}
