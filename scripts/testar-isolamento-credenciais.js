require("dotenv").config();

const {
    buscarClienteIntegracao
} = require("../src/services/clientesIntegracao");

const {
    listarConfiguracoesBancoCliente
} = require("../src/services/credenciaisBancarias");

const {
    obterTokenItau
} = require("../src/banks/itauTokenManager");


async function executar() {

    const fitDev =
        await buscarClienteIntegracao(
            "fit-dev"
        );

    const clienteB =
        await buscarClienteIntegracao(
            "cliente-teste-b"
        );


    if (!fitDev || !clienteB) {
        throw new Error(
            "Clientes de teste não encontrados."
        );
    }


    const configFit =
        await listarConfiguracoesBancoCliente(
            fitDev.id
        );

    const configB =
        await listarConfiguracoesBancoCliente(
            clienteB.id
        );


    const fitTemCash =
        configFit.some(
            item =>
                item.banco === "itau" &&
                item.produto ===
                    "cash_management" &&
                item.ambiente ===
                    "sandbox" &&
                item.ativo &&
                item.tem_credencial_criptografada
        );

    const bTemCash =
        configB.some(
            item =>
                item.banco === "itau" &&
                item.produto ===
                    "cash_management" &&
                item.ambiente ===
                    "sandbox" &&
                item.ativo
        );


    if (!fitTemCash) {
        throw new Error(
            "fit-dev não possui configuração Cash Management criptografada."
        );
    }


    if (bTemCash) {
        throw new Error(
            "cliente-teste-b possui configuração bancária inesperada."
        );
    }


    const tokenFit =
        await obterTokenItau({
            produto:
                "cash_management",
            clienteIntegracaoId:
                fitDev.id
        });


    if (
        tokenFit.origem !==
        "cliente_criptografado_manual"
    ) {
        throw new Error(
            `fit-dev usou origem inesperada: ${tokenFit.origem}`
        );
    }


    console.log(
        "[OK] fit-dev usa credencial criptografada própria."
    );


    let bloqueioB = false;


    try {
        await obterTokenItau({
            produto:
                "cash_management",
            clienteIntegracaoId:
                clienteB.id
        });

    } catch (erro) {

        if (
            erro.code ===
            "FIT_ITAU_CLIENT_CONFIG_AUSENTE"
        ) {
            bloqueioB = true;
        } else {
            throw erro;
        }
    }


    if (!bloqueioB) {
        throw new Error(
            "FALHA DE ISOLAMENTO: cliente-teste-b conseguiu obter credencial sem cadastro próprio."
        );
    }


    console.log(
        "[OK] cliente-teste-b sem credencial própria foi bloqueado."
    );
    console.log(
        "[OK] Não houve fallback para o token global do .env."
    );
    console.log(
        "[OK] Nenhum token ou client_id foi exibido."
    );
    console.log(
        "TESTE_CREDENCIAIS_MULTICLIENTE_OK"
    );
}


executar()
    .then(() => {
        process.exit(0);
    })
    .catch(erro => {
        console.error(
            "TESTE_FALHOU:",
            erro.code ||
            erro.message
        );
        process.exit(1);
    });
