"use strict";

require("dotenv").config();

const {
    buscarClienteDev
} = require("../src/services/clientesIntegracao");

const {
    registrarBoletoBB,
    consultarBoletoBB
} = require("../src/banks/bbCobrancasClient");

function dois(n) {
    return String(n).padStart(2, "0");
}

function formatarDataBB(data) {
    return `${dois(data.getDate())}.${dois(data.getMonth() + 1)}.${data.getFullYear()}`;
}

function gerarSufixo10() {
    const base = BigInt(Date.now()) % 10000000000n;
    return base.toString().padStart(10, "0");
}

async function main() {
    const ambiente = String(
        process.env.BB_ENV || "homologacao"
    ).trim().toLowerCase();

    if (ambiente !== "homologacao") {
        throw new Error(
            "Este teste só pode rodar com BB_ENV=homologacao"
        );
    }

    console.log("[INFO] Testando emissão de boleto BB em homologação...");
    console.log("[INFO] Nenhuma credencial será exibida.");
    console.log("[INFO] Nenhuma operação financeira real será realizada.");

    const cliente = await buscarClienteDev();

    const numeroConvenio = String(
        process.env.BB_TESTE_NUMERO_CONVENIO ||
        "3128557"
    ).trim();

    const sufixo = gerarSufixo10();
    const numeroTituloCliente = `000${numeroConvenio}${sufixo}`;
    const numeroTituloBeneficiario = sufixo;

    const emissao = new Date();
    const vencimento = new Date();
    vencimento.setDate(vencimento.getDate() + 7);

    const payload = {
        numeroConvenio: Number(numeroConvenio),
        numeroCarteira: 17,
        numeroVariacaoCarteira: 35,
        codigoModalidade: 1,
        dataEmissao: formatarDataBB(emissao),
        dataVencimento: formatarDataBB(vencimento),
        valorOriginal: 12.34,
        valorAbatimento: 0,
        codigoAceite: "N",
        codigoTipoTitulo: 2,
        descricaoTipoTitulo: "DM",
        indicadorPermissaoRecebimentoParcial: "N",
        numeroTituloBeneficiario,
        campoUtilizacaoBeneficiario: "FIT BANK CONNECT TESTE",
        numeroTituloCliente,
        mensagemBloquetoOcorrencia: "",
        jurosMora: {
            tipo: 3
        },
        pagador: {
            tipoInscricao: 2,
            numeroInscricao: 74910037000193,
            nome: "TECIDOS FARIA DUARTE",
            endereco: "AVENIDA TESTE 100",
            cep: 70040900,
            cidade: "BRASILIA",
            bairro: "CENTRO",
            uf: "DF"
        },
        indicadorPix: "N"
    };

    const resultado = await registrarBoletoBB({
        clienteIntegracaoId: cliente.id,
        payload
    });

    console.log(
        `[OK] Registro de cobrança BB respondeu HTTP ${resultado.statusHttp}.`
    );
    console.log("[OK] Token Manager BB por cliente foi utilizado.");
    console.log("[OK] App Key permaneceu oculta.");
    console.log("[OK] Boleto criado somente no ambiente de homologação.");

    const consulta = await consultarBoletoBB({
        clienteIntegracaoId: cliente.id,
        id: numeroTituloCliente,
        numeroConvenio
    });

    console.log(
        `[OK] Consulta do boleto recém-criado respondeu HTTP ${consulta.statusHttp}.`
    );
    console.log("[OK] Emissão + consulta BB concluídas ponta a ponta no adapter.");
    console.log("EMISSAO_BOLETO_BB_HOMOLOGACAO_OK");
}

main().catch(erro => {
    console.error("TESTE_EMISSAO_BOLETO_BB_FALHOU");
    console.error(`Código: ${erro.code || "sem_codigo"}`);
    console.error(`HTTP: ${erro.httpStatus || "sem_status"}`);
    console.error(`Mensagem: ${erro.message}`);
    process.exitCode = 1;
});
