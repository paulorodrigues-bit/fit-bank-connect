"use strict";

require("dotenv").config();

const {
    buscarClienteDev,
    buscarClienteIntegracao
} = require("../src/services/clientesIntegracao");

const {
    obterTokenBB,
    statusSeguroTokenBB
} = require("../src/banks/bbTokenManager");

async function main() {
    console.log("[INFO] Testando OAuth BB para Pagamentos em Lote...");
    console.log("[INFO] Client Secret, App Key e token permanecerão ocultos.");

    const cliente = await buscarClienteDev();

    const token = await obterTokenBB({
        produto: "pagamentos_lote",
        clienteIntegracaoId: cliente.id,
        forcarRenovacao: true
    });

    if (!token?.accessToken) {
        throw new Error("Token BB não foi retornado");
    }

    const status = statusSeguroTokenBB({
        produto: "pagamentos_lote",
        clienteIntegracaoId: cliente.id
    });

    if (!status.possui_token) {
        throw new Error("Token não foi armazenado no cache seguro");
    }

    console.log("[OK] OAuth BB Pagamentos em Lote respondeu com token.");
    console.log("[OK] Cache está isolado por cliente + produto + ambiente.");

    const clienteB = await buscarClienteIntegracao("cliente-teste-b");

    if (clienteB) {
        let bloqueado = false;

        try {
            await obterTokenBB({
                produto: "pagamentos_lote",
                clienteIntegracaoId: clienteB.id,
                forcarRenovacao: true
            });
        } catch (erro) {
            bloqueado = [
                "FIT_BB_CLIENT_CONFIG_AUSENTE",
                "FIT_BB_CLIENT_CONFIG_INCOMPLETA"
            ].includes(erro.code);
        }

        if (!bloqueado) {
            throw new Error(
                "Cliente B não foi bloqueado como esperado"
            );
        }

        console.log("[OK] Cliente B sem configuração própria foi bloqueado.");
    }

    console.log("BB_PAGAMENTOS_LOTE_TOKEN_V110_OK");
}

main().catch(erro => {
    console.error("TESTE_BB_PAGAMENTOS_TOKEN_V110_FALHOU");
    console.error(`Mensagem: ${erro.message}`);
    console.error(`Código: ${erro.code || "SEM_CODIGO"}`);
    console.error(`HTTP: ${erro.httpStatus || "sem_resposta_http"}`);
    process.exitCode = 1;
});
