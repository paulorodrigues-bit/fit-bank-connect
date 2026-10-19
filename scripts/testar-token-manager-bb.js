"use strict";

require("dotenv").config();

const {
    buscarClienteIntegracao
} = require("../src/services/clientesIntegracao");

const {
    obterTokenBB,
    invalidarTokenBB
} = require("../src/banks/bbTokenManager");

async function main() {
    const fitDev = await buscarClienteIntegracao("fit-dev");

    if (!fitDev?.id) {
        throw new Error("fit-dev não encontrado");
    }

    console.log("[INFO] Testando Token Manager BB por cliente...");

    invalidarTokenBB({
        clienteIntegracaoId: fitDev.id,
        produto: "cobrancas"
    });

    const primeiro = await obterTokenBB({
        clienteIntegracaoId: fitDev.id,
        produto: "cobrancas",
        forcarRenovacao: true
    });

    if (!primeiro.accessToken || !primeiro.appKey) {
        throw new Error("Token Manager BB retornou configuração incompleta");
    }

    console.log("[OK] fit-dev obteve token BB por configuração própria.");
    console.log("[OK] Access token recebido e mantido oculto.");
    console.log("[OK] App Key recuperada da camada criptografada e mantida oculta.");

    const segundo = await obterTokenBB({
        clienteIntegracaoId: fitDev.id,
        produto: "cobrancas"
    });

    if (segundo.origem !== "cache_cliente") {
        throw new Error("Cache do Token Manager BB não foi reutilizado");
    }

    console.log("[OK] Cache de token por cliente funcionando.");

    const clienteB = await buscarClienteIntegracao("cliente-teste-b");

    if (clienteB?.id) {
        let bloqueado = false;

        try {
            await obterTokenBB({
                clienteIntegracaoId: clienteB.id,
                produto: "cobrancas",
                forcarRenovacao: true
            });
        } catch (erro) {
            if (erro.code === "FIT_BB_CLIENT_CONFIG_AUSENTE") {
                bloqueado = true;
            } else {
                throw erro;
            }
        }

        if (!bloqueado) {
            throw new Error(
                "cliente-teste-b acessou autenticação BB sem configuração própria"
            );
        }

        console.log("[OK] cliente-teste-b sem credencial BB própria foi bloqueado.");
        console.log("[OK] Não houve fallback para a credencial BB do fit-dev.");
    }

    console.log("TOKEN_MANAGER_BB_MULTICLIENTE_OK");
}

main().catch(erro => {
    console.error("TESTE_TOKEN_MANAGER_BB_FALHOU");
    console.error(`Código: ${erro.code || "N/A"}`);
    console.error(`Mensagem: ${erro.message}`);
    process.exitCode = 1;
});
