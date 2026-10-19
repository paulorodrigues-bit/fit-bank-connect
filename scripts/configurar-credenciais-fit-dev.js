require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const {
    buscarClienteIntegracao
} = require("../src/services/clientesIntegracao");

const {
    salvarConfiguracaoBancoCliente,
    listarConfiguracoesBancoCliente
} = require("../src/services/credenciaisBancarias");


const ENV_PATH = path.resolve(
    process.cwd(),
    ".env"
);


function lerEnvArquivo() {

    if (!fs.existsSync(ENV_PATH)) {
        throw new Error(
            `.env não encontrado em ${ENV_PATH}`
        );
    }


    return fs.readFileSync(
        ENV_PATH,
        "utf8"
    );
}


function definirVariavelEnv(
    nome,
    valor
) {

    let conteudo =
        lerEnvArquivo();

    const linha =
        `${nome}=${valor}`;

    const regex =
        new RegExp(
            `^\\s*${nome}\\s*=.*$`,
            "m"
        );


    if (regex.test(conteudo)) {
        conteudo =
            conteudo.replace(
                regex,
                linha
            );
    } else {

        if (
            conteudo &&
            !conteudo.endsWith("\n")
        ) {
            conteudo += "\n";
        }

        conteudo += `${linha}\n`;
    }


    fs.writeFileSync(
        ENV_PATH,
        conteudo,
        "utf8"
    );

    process.env[nome] =
        valor;
}


function garantirChaveCriptografia() {

    const atual =
        String(
            process.env
                .FIT_BANK_CREDENTIALS_KEY ||
            ""
        ).trim();


    if (atual) {
        console.log(
            "[OK] Chave de criptografia bancária já configurada."
        );
        return;
    }


    const novaChave =
        crypto
            .randomBytes(32)
            .toString("hex");


    definirVariavelEnv(
        "FIT_BANK_CREDENTIALS_KEY",
        novaChave
    );


    console.log(
        "[OK] Chave de criptografia bancária gerada e salva no .env."
    );
}


async function executar() {

    console.log(
        "FIT Bank Connect - configuração bancária por cliente"
    );


    garantirChaveCriptografia();


    definirVariavelEnv(
        "FIT_ALLOW_LEGACY_BANK_ENV",
        "false"
    );

    console.log(
        "[OK] Fallback de credenciais bancárias globais desativado."
    );


    const ambiente =
        String(
            process.env.ITAU_ENV ||
            "sandbox"
        )
            .trim()
            .toLowerCase();


    if (ambiente !== "sandbox") {
        throw new Error(
            "Este script é destinado ao Sandbox atual. ITAU_ENV deve ser sandbox."
        );
    }


    const clientId =
        String(
            process.env.ITAU_CLIENT_ID ||
            ""
        ).trim();

    const token =
        String(
            process.env.ITAU_SANDBOX_TOKEN ||
            ""
        ).trim();


    if (!clientId) {
        throw new Error(
            "ITAU_CLIENT_ID não encontrado no .env"
        );
    }


    if (!token) {
        throw new Error(
            "ITAU_SANDBOX_TOKEN não encontrado no .env"
        );
    }


    const cliente =
        await buscarClienteIntegracao(
            "fit-dev"
        );


    if (!cliente) {
        throw new Error(
            "Cliente fit-dev não encontrado."
        );
    }


    await salvarConfiguracaoBancoCliente({
        clienteIntegracaoId:
            cliente.id,
        banco:
            "itau",
        produto:
            "cash_management",
        ambiente:
            "sandbox",
        authMode:
            "manual",
        clientId,
        configuracao: {
            origem:
                "migracao_env_para_cliente_v1_2",
            uso:
                "sandbox"
        },
        credenciais: {
            sandbox_token:
                token
        }
    });


    const configuracoes =
        await listarConfiguracoesBancoCliente(
            cliente.id
        );


    const cash =
        configuracoes.find(
            item =>
                item.banco === "itau" &&
                item.produto ===
                    "cash_management" &&
                item.ambiente ===
                    "sandbox" &&
                item.ativo
        );


    if (
        !cash ||
        !cash.tem_client_id ||
        !cash.tem_credencial_criptografada
    ) {
        throw new Error(
            "A configuração bancária não foi persistida corretamente."
        );
    }


    console.log(
        "[OK] Itaú Cash Management do fit-dev salvo por cliente."
    );
    console.log(
        "[OK] Credencial armazenada criptografada com AES-256-GCM."
    );
    console.log(
        "[OK] Nenhum token ou chave foi exibido no terminal."
    );
    console.log(
        "CONCLUIDO"
    );
}


executar()
    .then(() => {
        process.exit(0);
    })
    .catch(erro => {
        console.error(
            "FALHA:",
            erro.code ||
            erro.message
        );
        process.exit(1);
    });
