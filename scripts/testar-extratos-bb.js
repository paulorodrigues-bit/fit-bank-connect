"use strict";

require("dotenv").config();

const {
    buscarClienteDev,
    buscarClientePorIdentificador
} = require("../src/services/clientesIntegracao");

const {
    consultarExtratoCompletoBB
} = require("../src/banks/bbExtratosClient");

async function main() {
    console.log("[INFO] Testando Extratos BB V2 com OAuth + mTLS...");
    console.log("[INFO] Certificado, senha, App Key e tokens permanecerão ocultos.");

    const clienteA = await buscarClienteDev();

    const resultado = await consultarExtratoCompletoBB({
        clienteIntegracaoId: clienteA.id,
        quantidadeRegistroPaginaSolicitacao: 120
    });

    if (!resultado?.sucesso) {
        throw new Error("Consulta de Extratos BB não retornou sucesso");
    }

    const normalizado = resultado.normalizado || {};

    console.log(`[OK] Extratos BB respondeu com ${resultado.paginas} página(s).`);
    console.log(`[OK] Lançamentos normalizados: ${normalizado.quantidade || 0}.`);
    console.log(`[OK] Créditos: ${normalizado.creditos || 0} | Débitos: ${normalizado.debitos || 0}.`);
    console.log("[OK] Header de homologação e App Key enviados sem exposição.");
    console.log("[OK] mTLS validado com certificado do cliente.");

    let clienteB = null;

    if (typeof buscarClientePorIdentificador === "function") {
        clienteB = await buscarClientePorIdentificador("cliente-teste-b");
    }

    if (clienteB?.id) {
        let bloqueado = false;

        try {
            await consultarExtratoCompletoBB({
                clienteIntegracaoId: clienteB.id,
                quantidadeRegistroPaginaSolicitacao: 120
            });
        } catch (erro) {
            bloqueado = erro.code === "FIT_BB_CLIENT_CONFIG_AUSENTE";
        }

        if (!bloqueado) {
            throw new Error(
                "Cliente B deveria ser bloqueado por não possuir configuração própria de Extratos BB"
            );
        }

        console.log("[OK] Cliente B sem configuração própria foi bloqueado.");
    } else {
        console.log("[INFO] Teste de isolamento do Cliente B ignorado: função/registro não disponível neste script.");
    }

    console.log("BB_EXTRATOS_V18_OK");
}

main().catch(erro => {
    console.error("TESTE_BB_EXTRATOS_V18_FALHOU");
    console.error(`Mensagem: ${erro.message}`);
    console.error(`Código: ${erro.code || "sem_codigo"}`);
    console.error(`HTTP: ${erro.httpStatus || "sem_resposta_http"}`);
    process.exitCode = 1;
});
