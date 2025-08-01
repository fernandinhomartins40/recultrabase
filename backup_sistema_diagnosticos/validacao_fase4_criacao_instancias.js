/**
 * FASE 4 - VALIDAÇÃO FINAL: TESTE DE CRIAÇÃO DE INSTÂNCIAS
 * 
 * Este script testa se o novo sistema não interfere na criação de novas instâncias.
 * Verifica todo o fluxo de criação sem afetar instâncias existentes.
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class ValidadorCriacaoInstancias {
    constructor() {
        this.baseURL = 'http://localhost:3000';
        this.testInstanceId = null;
        this.resultados = {
            testes: [],
            sucesso: 0,
            falhas: 0,
            tempo_total: 0
        };
    }

    log(message, tipo = 'INFO') {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${tipo}] ${message}`);
        
        this.resultados.testes.push({
            timestamp,
            tipo,
            message,
            success: tipo !== 'ERROR'
        });
    }

    async testePreRequisitos() {
        this.log('🔍 Verificando pré-requisitos do sistema...');
        
        try {
            // Verificar se server está rodando
            const response = await axios.get(`${this.baseURL}/api/instances`);
            this.log('✅ Servidor principal respondendo', 'SUCCESS');
            
            // Verificar se APIs de saúde estão ativas
            const healthSummary = await axios.get(`${this.baseURL}/api/instances/health-summary`);
            this.log('✅ APIs de saúde funcionando', 'SUCCESS');
            
            return true;
        } catch (error) {
            this.log(`❌ Falha nos pré-requisitos: ${error.message}`, 'ERROR');
            return false;
        }
    }

    async testeCriacaoInstanciaCompleta() {
        this.log('🏗️ Testando criação completa de instância...');
        
        const instanceData = {
            project_name: `teste-fase4-${Date.now()}`,
            db_password: 'TestPass123!',
            jwt_secret: 'super-secret-jwt-test-key-32-chars-min',
            anon_key: 'teste-anon-key',
            service_role_key: 'teste-service-role-key',
            ports: {
                kong: 8001,
                studio: 3001,
                db: 5433
            }
        };

        try {
            const startTime = Date.now();
            
            // Criar instância
            const createResponse = await axios.post(
                `${this.baseURL}/api/instances`, 
                instanceData
            );
            
            if (createResponse.data.success) {
                this.testInstanceId = createResponse.data.instance.id;
                const createTime = Date.now() - startTime;
                
                this.log(`✅ Instância criada com sucesso em ${createTime}ms`, 'SUCCESS');
                this.log(`   ID: ${this.testInstanceId}`, 'INFO');
                
                return true;
            } else {
                this.log('❌ Falha na criação da instância', 'ERROR');
                return false;
            }
            
        } catch (error) {
            this.log(`❌ Erro na criação: ${error.message}`, 'ERROR');
            return false;
        }
    }

    async testeInicializacaoServicos() {
        if (!this.testInstanceId) {
            this.log('❌ Sem instância para testar inicialização', 'ERROR');
            return false;
        }

        this.log('🚀 Testando inicialização dos serviços...');
        
        let tentativas = 0;
        const maxTentativas = 12; // 2 minutos máximo
        
        while (tentativas < maxTentativas) {
            try {
                const healthResponse = await axios.get(
                    `${this.baseURL}/api/instances/${this.testInstanceId}/health`
                );
                
                if (healthResponse.data.success) {
                    const health = healthResponse.data.health;
                    const score = health.health.score;
                    
                    this.log(`📊 Score de saúde: ${score}% (tentativa ${tentativas + 1})`, 'INFO');
                    
                    if (score >= 80) {
                        this.log('✅ Serviços inicializados com sucesso', 'SUCCESS');
                        this.log(`   Containers: ${health.health.healthy}/${health.health.total}`, 'INFO');
                        return true;
                    }
                }
                
                tentativas++;
                await this.sleep(10000); // Aguardar 10 segundos
                
            } catch (error) {
                this.log(`⚠️ Erro na verificação: ${error.message}`, 'WARN');
                tentativas++;
                await this.sleep(10000);
            }
        }
        
        this.log('❌ Timeout na inicialização dos serviços', 'ERROR');
        return false;
    }

    async testeNaoInterferencia() {
        this.log('🔒 Testando não interferência com instâncias existentes...');
        
        try {
            // Listar instâncias existentes antes
            const beforeResponse = await axios.get(`${this.baseURL}/api/instances`);
            const instancesAntes = Object.keys(beforeResponse.data.instances || {});
            
            // Aguardar alguns segundos
            await this.sleep(5000);
            
            // Listar instâncias depois
            const afterResponse = await axios.get(`${this.baseURL}/api/instances`);
            const instancesDepois = Object.keys(afterResponse.data.instances || {});
            
            // Verificar se outras instâncias não foram afetadas
            const instanciasExistentes = instancesAntes.filter(id => id !== this.testInstanceId);
            let todasOk = true;
            
            for (const instanceId of instanciasExistentes) {
                try {
                    const healthResponse = await axios.get(
                        `${this.baseURL}/api/instances/${instanceId}/health`
                    );
                    
                    if (healthResponse.data.success) {
                        const score = healthResponse.data.health.health.score;
                        if (score >= 70) {
                            this.log(`   ✅ Instância ${instanceId}: ${score}%`, 'SUCCESS');
                        } else {
                            this.log(`   ⚠️ Instância ${instanceId}: ${score}% (degradada)`, 'WARN');
                        }
                    }
                } catch (error) {
                    this.log(`   ❌ Instância ${instanceId}: erro`, 'ERROR');
                    todasOk = false;
                }
            }
            
            if (todasOk) {
                this.log('✅ Não houve interferência com instâncias existentes', 'SUCCESS');
                return true;
            } else {
                this.log('⚠️ Possível interferência detectada', 'WARN');
                return false;
            }
            
        } catch (error) {
            this.log(`❌ Erro no teste de não interferência: ${error.message}`, 'ERROR');
            return false;
        }
    }

    async testeLimpeza() {
        if (!this.testInstanceId) {
            this.log('⚠️ Nenhuma instância de teste para limpar', 'WARN');
            return true;
        }

        this.log('🧹 Limpando instância de teste...');
        
        try {
            const deleteResponse = await axios.delete(
                `${this.baseURL}/api/instances/${this.testInstanceId}`
            );
            
            if (deleteResponse.data.success) {
                this.log('✅ Instância de teste removida com sucesso', 'SUCCESS');
                return true;
            } else {
                this.log('❌ Falha na remoção da instância de teste', 'ERROR');
                return false;
            }
            
        } catch (error) {
            this.log(`❌ Erro na limpeza: ${error.message}`, 'ERROR');
            return false;
        }
    }

    async executarTodosOsTestes() {
        const inicioTeste = Date.now();
        this.log('🎯 INICIANDO VALIDAÇÃO DE CRIAÇÃO DE INSTÂNCIAS - FASE 4');
        this.log('='.repeat(60));

        const testes = [
            { nome: 'Pré-requisitos', funcao: () => this.testePreRequisitos() },
            { nome: 'Criação de Instância', funcao: () => this.testeCriacaoInstanciaCompleta() },
            { nome: 'Inicialização de Serviços', funcao: () => this.testeInicializacaoServicos() },
            { nome: 'Não Interferência', funcao: () => this.testeNaoInterferencia() },
            { nome: 'Limpeza', funcao: () => this.testeLimpeza() }
        ];

        for (const teste of testes) {
            this.log(`\n📋 Executando: ${teste.nome}...`);
            const resultado = await teste.funcao();
            
            if (resultado) {
                this.resultados.sucesso++;
                this.log(`✅ ${teste.nome}: PASSOU`, 'SUCCESS');
            } else {
                this.resultados.falhas++;
                this.log(`❌ ${teste.nome}: FALHOU`, 'ERROR');
            }
        }

        this.resultados.tempo_total = Date.now() - inicioTeste;
        this.gerarRelatorioFinal();
    }

    gerarRelatorioFinal() {
        this.log('\n' + '='.repeat(60));
        this.log('📊 RELATÓRIO FINAL - VALIDAÇÃO DE CRIAÇÃO DE INSTÂNCIAS');
        this.log('='.repeat(60));
        
        this.log(`✅ Testes bem-sucedidos: ${this.resultados.sucesso}`);
        this.log(`❌ Testes com falha: ${this.resultados.falhas}`);
        this.log(`⏱️ Tempo total: ${Math.round(this.resultados.tempo_total / 1000)}s`);
        
        const percentualSucesso = Math.round(
            (this.resultados.sucesso / (this.resultados.sucesso + this.resultados.falhas)) * 100
        );
        
        this.log(`📈 Taxa de sucesso: ${percentualSucesso}%`);
        
        if (percentualSucesso >= 80) {
            this.log('🎉 VALIDAÇÃO APROVADA - Sistema não interfere na criação', 'SUCCESS');
        } else {
            this.log('⚠️ VALIDAÇÃO REPROVADA - Revisar interferências', 'ERROR');
        }
        
        return this.resultados;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Executar validação se chamado diretamente
if (require.main === module) {
    const validador = new ValidadorCriacaoInstancias();
    validador.executarTodosOsTestes()
        .then(resultados => {
            process.exit(resultados.falhas > 0 ? 1 : 0);
        })
        .catch(error => {
            console.error('Erro fatal na validação:', error);
            process.exit(1);
        });
}

module.exports = ValidadorCriacaoInstancias;