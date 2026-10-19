require("dotenv").config();

const { pool } = require("../src/database");
const { buscarClienteIntegracao } = require("../src/services/clientesIntegracao");

async function executar() {
    const cliente = await buscarClienteIntegracao("cliente-teste-b");

    if (!cliente) {
        throw new Error("cliente-teste-b não encontrado.");
    }

    await pool.query(
        `
        update bank_connect.cliente_bancos
        set ativo = false,
            atualizado_em = now()
        where cliente_integracao_id = $1
          and lower(banco) = 'itau'
          and lower(produto) = 'cash_management'
          and lower(ambiente) = 'sandbox'
          and configuracao ->> 'origem' = 'teste_controlado_auth_ab_v1_2'
        `,
        [cliente.id]
    );

    console.log("[OK] Credencial deliberadamente inválida do Cliente B foi desativada.");
    console.log("AMBIENTE_DE_TESTE_LIMPO");
}

executar()
    .then(async () => {
        await pool.end();
        process.exit(0);
    })
    .catch(async erro => {
        console.error("FALHA:", erro.message);
        try { await pool.end(); } catch (_) {}
        process.exit(1);
    });
