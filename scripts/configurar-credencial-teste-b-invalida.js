require("dotenv").config();

const {
    buscarClienteIntegracao
} = require("../src/services/clientesIntegracao");

const {
    salvarConfiguracaoBancoCliente
} = require("../src/services/credenciaisBancarias");

async function executar() {
    if (!String(process.env.FIT_BANK_CREDENTIALS_KEY || "").trim()) {
        throw new Error("FIT_BANK_CREDENTIALS_KEY não configurada. Rode primeiro a configuração de credenciais do fit-dev.");
    }

    const cliente = await buscarClienteIntegracao("cliente-teste-b");

    if (!cliente) {
        throw new Error("cliente-teste-b não encontrado.");
    }

    await salvarConfiguracaoBancoCliente({
        clienteIntegracaoId: cliente.id,
        banco: "itau",
        produto: "cash_management",
        ambiente: "sandbox",
        authMode: "manual",
        clientId: "CLIENTE-B-TESTE-ISOLAMENTO",
        configuracao: {
            origem: "teste_controlado_auth_ab_v1_2",
            uso: "somente_teste",
            credencial_real: false
        },
        credenciais: {
            sandbox_token: "TOKEN-INVALIDO-SOMENTE-TESTE-ISOLAMENTO-B"
        }
    });

    console.log("[OK] Cliente B recebeu uma credencial de teste própria e deliberadamente inválida.");
    console.log("[OK] Nenhuma credencial real foi copiada do fit-dev.");
    console.log("[OK] O valor de teste foi armazenado pela mesma camada criptografada.");
    console.log("PRONTO_PARA_TESTE_AUTH_AB");
}

executar()
    .then(() => process.exit(0))
    .catch(erro => {
        console.error("FALHA:", erro.code || erro.message);
        process.exit(1);
    });
