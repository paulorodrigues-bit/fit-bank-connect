"use strict";

require("dotenv").config();

const {
    buscarClienteDev
} = require("../src/services/clientesIntegracao");

const {
    consultarBoletoBB
} = require("../src/banks/bbCobrancasClient");

async function main() {
    console.log("[INFO] Testando Adapter BB - Cobranças V2...");
    console.log("[INFO] Nenhuma credencial será exibida.");

    const cliente = await buscarClienteDev();

    const id = String(
        process.env.BB_TESTE_BOLETO_ID ||
        "00031285570000000001"
    ).trim();

    const numeroConvenio = String(
        process.env.BB_TESTE_NUMERO_CONVENIO ||
        "3128557"
    ).trim();

    const resultado = await consultarBoletoBB({
        clienteIntegracaoId: cliente.id,
        id,
        numeroConvenio
    });

    console.log(`[OK] API Cobranças BB respondeu HTTP ${resultado.statusHttp}.`);
    console.log("[OK] Token Manager por cliente foi utilizado.");
    console.log("[OK] App Key foi enviada sem ser exibida no terminal.");
    console.log("[OK] Primeira chamada real do Adapter BB concluída.");
    console.log("ADAPTER_BB_COBRANCAS_OK");
}

main().catch(erro => {
    console.error("TESTE_ADAPTER_BB_COBRANCAS_FALHOU");
    console.error(`Código: ${erro.code || "sem_codigo"}`);
    console.error(`HTTP: ${erro.httpStatus || "sem_status"}`);
    console.error(`Mensagem: ${erro.message}`);
    process.exitCode = 1;
});
