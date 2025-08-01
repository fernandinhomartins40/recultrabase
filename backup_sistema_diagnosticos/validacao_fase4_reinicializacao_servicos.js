/**
 * FASE 4 - VALIDAÇÃO FINAL: TESTE DE REINICIALIZAÇÃO DE SERVIÇOS
 * 
 * Este script testa extensivamente o sistema de reinicialização (service-restarter.js).
 * Valida ordem de reinicialização, recuperação de falhas e impacto nos serviços.
 */

const axios = require('axios');

class ValidadorReinicializacaoServicos {
    constructor() {
        this.baseURL = 'http://localhost:3000';
        this.resultados = {
            testes: [],
            sucesso: 0,
            falhas: 0,
            tempo_total: 0,
            metricas_reinicializacao: {
                tempo_medio_restart: 0,
                taxa_recuperacao: 0,
                impacto_temporario: 0
            }
        };
        this.instanciasTeste = [];
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

    async obterInstanciasSaudaveis() {
        this.log('🔍 Identificando instâncias saudáveis para teste...');
        
        try {
            const response = await axios.get(`${this.baseURL}/api/instances/health-summary`);
            
            if (!response.data.success || !response.data.instances) {
                this.log('❌ Não foi possível obter resumo de saúde', 'ERROR');
                return [];
            }

            const instanciasSaudaveis = [];
            
            for (const [instanceId, health] of Object.entries(response.data.instances)) {
                const score = health.health?.score || 0;
                
                if (score >= 70) {
                    instanciasSaudaveis.push(instanceId);
                    this.log(`   ✅ ${instanceId}: ${score}% (saudável)`, 'SUCCESS');
                } else {
                    this.log(`   ⚠️ ${instanceId}: ${score}% (não adequada para teste)`, 'WARN');
                }
            }

            this.instanciasTeste = instanciasSaudaveis.slice(0, 2); // Máximo 2 para teste
            this.log(`📊 Selecionadas ${this.instanciasTeste.length} instâncias para teste`, 'INFO');
            
            return instanciasSaudaveis;

        } catch (error) {
            this.log(`❌ Erro ao obter instâncias: ${error.message}`, 'ERROR');
            return [];
        }
    }

    async testeReinicializacaoCompleta(instanceId) {
        this.log(`🔄 Testando reinicialização completa: ${instanceId}`);
        
        try {
            // Status antes da reinicialização
            const statusAntes = await this.obterStatusInstancia(instanceId);
            if (!statusAntes) {
                this.log(`❌ Não foi possível obter status inicial de ${instanceId}`, 'ERROR');
                return false;
            }

            this.log(`   📊 Status inicial: ${statusAntes.score}%`, 'INFO');

            // Executar reinicialização
            const inicioRestart = Date.now();
            const restartResponse = await axios.post(
                `${this.baseURL}/api/instances/${instanceId}/restart-services`,
                { forceAll: false }
            );

            if (!restartResponse.data.success) {
                this.log(`❌ API de reinicialização falhou para ${instanceId}`, 'ERROR');
                return false;
            }

            const tempoRestart = Date.now() - inicioRestart;
            const result = restartResponse.data.result;

            this.log(`   ⏱️ Reinicialização executada em ${Math.round(tempoRestart / 1000)}s`, 'INFO');
            this.log(`   📊 Score: ${result.initialScore}% → ${result.finalScore}%`, 'INFO');

            // Aguardar estabilização
            await this.sleep(10000);

            // Verificar recuperação
            const statusDepois = await this.obterStatusInstancia(instanceId);
            if (!statusDepois) {
                this.log(`❌ Não foi possível verificar recuperação de ${instanceId}`, 'ERROR');
                return false;
            }

            const recuperou = statusDepois.score >= statusAntes.score * 0.9; // 90% do score original
            
            if (recuperou) {
                this.log(`✅ Recuperação bem-sucedida: ${statusDepois.score}%`, 'SUCCESS');
                return {
                    success: true,
                    tempoRestart,
                    scoreAntes: statusAntes.score,
                    scoreDepois: statusDepois.score,
                    recuperacao: (statusDepois.score / statusAntes.score) * 100
                };
            } else {
                this.log(`❌ Falha na recuperação: ${statusDepois.score}% < ${statusAntes.score * 0.9}%`, 'ERROR');
                return false;
            }

        } catch (error) {
            this.log(`❌ Erro na reinicialização de ${instanceId}: ${error.message}`, 'ERROR');
            return false;
        }
    }

    async testeReinicializacaoServicoEspecifico(instanceId) {
        this.log(`🎯 Testando reinicialização de serviço específico: ${instanceId}`);
        
        const servicos = ['db', 'kong', 'auth', 'rest', 'studio'];
        let sucessos = 0;

        for (const servico of servicos) {
            this.log(`   🔄 Reiniciando serviço: ${servico}`);
            
            try {
                const statusAntes = await this.obterStatusInstancia(instanceId);
                
                const response = await axios.post(
                    `${this.baseURL}/api/instances/${instanceId}/restart-service/${servico}`
                );

                if (response.data.success) {
                    // Aguardar um pouco para estabilizar
                    await this.sleep(5000);
                    
                    const statusDepois = await this.obterStatusInstancia(instanceId);
                    
                    if (statusDepois && statusDepois.score >= statusAntes.score * 0.8) {
                        this.log(`     ✅ ${servico}: OK (${statusDepois.score}%)`, 'SUCCESS');
                        sucessos++;
                    } else {
                        this.log(`     ⚠️ ${servico}: Degradação detectada`, 'WARN');
                    }
                } else {
                    this.log(`     ❌ ${servico}: Falha na API`, 'ERROR');
                }

            } catch (error) {
                this.log(`     ❌ ${servico}: ${error.message}`, 'ERROR');
            }

            // Aguardar entre serviços
            await this.sleep(3000);
        }

        const taxaSucesso = (sucessos / servicos.length) * 100;
        this.log(`📊 Reinicializações específicas: ${sucessos}/${servicos.length} (${Math.round(taxaSucesso)}%)`, 'INFO');

        return taxaSucesso >= 80; // 80% de sucesso mínimo
    }

    async testeReinicializacaoForcada(instanceId) {
        this.log(`💪 Testando reinicialização forçada: ${instanceId}`);
        
        try {
            const statusAntes = await this.obterStatusInstancia(instanceId);
            
            const inicioRestart = Date.now();
            const response = await axios.post(
                `${this.baseURL}/api/instances/${instanceId}/restart-services`,
                { forceAll: true }
            );

            if (!response.data.success) {
                this.log(`❌ Reinicialização forçada falhou`, 'ERROR');
                return false;
            }

            const tempoRestart = Date.now() - inicioRestart;
            const result = response.data.result;

            this.log(`   ⏱️ Reinicialização forçada: ${Math.round(tempoRestart / 1000)}s`, 'INFO');
            this.log(`   📊 Resultado: ${result.success ? 'Sucesso' : 'Falha'}`, result.success ? 'SUCCESS' : 'ERROR');

            // Aguardar estabilização completa
            await this.sleep(15000);

            const statusDepois = await this.obterStatusInstancia(instanceId);
            const recuperacao = statusDepois ? (statusDepois.score / statusAntes.score) * 100 : 0;

            this.log(`   📊 Recuperação: ${Math.round(recuperacao)}%`, 'INFO');

            return recuperacao >= 90; // 90% de recuperação mínima

        } catch (error) {
            this.log(`❌ Erro na reinicialização forçada: ${error.message}`, 'ERROR');
            return false;
        }
    }

    async testeImpactoSimultaneo() {
        this.log('⚡ Testando impacto de reinicializações simultâneas...');
        
        if (this.instanciasTeste.length < 2) {
            this.log('⚠️ Não há instâncias suficientes para teste simultâneo', 'WARN');
            return true; // Pular teste se não há instâncias suficientes
        }

        try {
            // Status inicial de todas as instâncias
            const statusIniciais = {};
            for (const instanceId of this.instanciasTeste) {
                statusIniciais[instanceId] = await this.obterStatusInstancia(instanceId);
            }

            // Reinicializar simultaneamente
            this.log('🚀 Iniciando reinicializações simultâneas...');
            const promises = this.instanciasTeste.map(instanceId => 
                axios.post(`${this.baseURL}/api/instances/${instanceId}/restart-services`, { forceAll: false })
            );

            const inicioSimultaneo = Date.now();
            const resultados = await Promise.allSettled(promises);
            const tempoSimultaneo = Date.now() - inicioSimultaneo;

            let sucessosSimultaneos = 0;
            resultados.forEach((resultado, index) => {
                const instanceId = this.instanciasTeste[index];
                if (resultado.status === 'fulfilled' && resultado.value.data.success) {
                    this.log(`   ✅ ${instanceId}: Reinicialização simultânea OK`, 'SUCCESS');
                    sucessosSimultaneos++;
                } else {
                    this.log(`   ❌ ${instanceId}: Falha na reinicialização simultânea`, 'ERROR');
                }
            });

            this.log(`⏱️ Tempo total simultâneo: ${Math.round(tempoSimultaneo / 1000)}s`, 'INFO');

            // Aguardar estabilização
            await this.sleep(20000);

            // Verificar recuperação de todas
            let recuperacoesOk = 0;
            for (const instanceId of this.instanciasTeste) {
                const statusFinal = await this.obterStatusInstancia(instanceId);
                const statusInicial = statusIniciais[instanceId];
                
                if (statusFinal && statusInicial) {
                    const recuperacao = (statusFinal.score / statusInicial.score) * 100;
                    
                    if (recuperacao >= 85) {
                        recuperacoesOk++;
                        this.log(`   ✅ ${instanceId}: Recuperação ${Math.round(recuperacao)}%`, 'SUCCESS');
                    } else {
                        this.log(`   ⚠️ ${instanceId}: Recuperação baixa ${Math.round(recuperacao)}%`, 'WARN');
                    }
                }
            }

            const taxaRecuperacao = (recuperacoesOk / this.instanciasTeste.length) * 100;
            this.log(`📊 Taxa de recuperação simultânea: ${Math.round(taxaRecuperacao)}%`, 'INFO');

            return taxaRecuperacao >= 80;

        } catch (error) {
            this.log(`❌ Erro no teste simultâneo: ${error.message}`, 'ERROR');
            return false;
        }
    }

    async obterStatusInstancia(instanceId) {
        try {
            const response = await axios.get(`${this.baseURL}/api/instances/${instanceId}/health`);
            
            if (response.data.success && response.data.health?.health) {
                return {
                    score: response.data.health.health.score,
                    status: response.data.health.health.status,
                    healthy: response.data.health.health.healthy,
                    total: response.data.health.health.total
                };
            }
            
            return null;

        } catch (error) {
            this.log(`⚠️ Erro ao obter status de ${instanceId}: ${error.message}`, 'WARN');
            return null;
        }
    }

    async executarTodosOsTestes() {
        const inicioTeste = Date.now();
        this.log('🎯 INICIANDO VALIDAÇÃO DE REINICIALIZAÇÃO DE SERVIÇOS - FASE 4');
        this.log('='.repeat(60));

        // Identificar instâncias para teste
        const instancias = await this.obterInstanciasSaudaveis();
        if (instancias.length === 0) {
            this.log('❌ Nenhuma instância saudável encontrada para teste', 'ERROR');
            return this.resultados;
        }

        const testes = [
            { nome: 'Reinicialização Completa', funcao: () => this.testeTodasReinicializacoesCompletas() },
            { nome: 'Reinicialização de Serviços Específicos', funcao: () => this.testeServicosEspecificos() },
            { nome: 'Reinicialização Forçada', funcao: () => this.testeReinicializacaoForcadaTodas() },
            { nome: 'Impacto Simultâneo', funcao: () => this.testeImpactoSimultaneo() }
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
        return this.resultados;
    }

    async testeTodasReinicializacoesCompletas() {
        let sucessos = 0;
        let tempoTotal = 0;
        let recuperacaoTotal = 0;

        for (const instanceId of this.instanciasTeste) {
            const resultado = await this.testeReinicializacaoCompleta(instanceId);
            
            if (resultado && resultado.success) {
                sucessos++;
                tempoTotal += resultado.tempoRestart;
                recuperacaoTotal += resultado.recuperacao;
            }
        }

        if (sucessos > 0) {
            this.resultados.metricas_reinicializacao.tempo_medio_restart = Math.round(tempoTotal / sucessos);
            this.resultados.metricas_reinicializacao.taxa_recuperacao = Math.round(recuperacaoTotal / sucessos);
        }

        return sucessos >= this.instanciasTeste.length * 0.8;
    }

    async testeServicosEspecificos() {
        let sucessos = 0;

        for (const instanceId of this.instanciasTeste) {
            const resultado = await this.testeReinicializacaoServicoEspecifico(instanceId);
            if (resultado) sucessos++;
        }

        return sucessos >= this.instanciasTeste.length * 0.8;
    }

    async testeReinicializacaoForcadaTodas() {
        let sucessos = 0;

        for (const instanceId of this.instanciasTeste) {
            const resultado = await this.testeReinicializacaoForcada(instanceId);
            if (resultado) sucessos++;
        }

        return sucessos >= this.instanciasTeste.length * 0.8;
    }

    gerarRelatorioFinal() {
        this.log('\n' + '='.repeat(60));
        this.log('📊 RELATÓRIO FINAL - VALIDAÇÃO DE REINICIALIZAÇÃO DE SERVIÇOS');
        this.log('='.repeat(60));
        
        this.log(`🔄 Instâncias testadas: ${this.instanciasTeste.length}`);
        this.log(`✅ Testes bem-sucedidos: ${this.resultados.sucesso}`);
        this.log(`❌ Testes com falha: ${this.resultados.falhas}`);
        this.log(`⏱️ Tempo total: ${Math.round(this.resultados.tempo_total / 1000)}s`);
        
        const metricas = this.resultados.metricas_reinicializacao;
        if (metricas.tempo_medio_restart > 0) {
            this.log(`⚡ Tempo médio de restart: ${Math.round(metricas.tempo_medio_restart / 1000)}s`);
            this.log(`📈 Taxa média de recuperação: ${metricas.taxa_recuperacao}%`);
        }
        
        const percentualSucesso = Math.round(
            (this.resultados.sucesso / (this.resultados.sucesso + this.resultados.falhas)) * 100
        );
        
        this.log(`📊 Taxa de sucesso: ${percentualSucesso}%`);
        
        if (percentualSucesso >= 80) {
            this.log('🎉 VALIDAÇÃO APROVADA - Sistema de reinicialização funcionando corretamente', 'SUCCESS');
        } else {
            this.log('⚠️ VALIDAÇÃO REPROVADA - Revisar sistema de reinicialização', 'ERROR');
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Executar validação se chamado diretamente
if (require.main === module) {
    const validador = new ValidadorReinicializacaoServicos();
    validador.executarTodosOsTestes()
        .then(resultados => {
            process.exit(resultados.falhas > 0 ? 1 : 0);
        })
        .catch(error => {
            console.error('Erro fatal na validação:', error);
            process.exit(1);
        });
}

module.exports = ValidadorReinicializacaoServicos;