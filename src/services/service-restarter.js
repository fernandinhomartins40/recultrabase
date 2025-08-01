/**
 * Service Restarter - Reinicialização inteligente de serviços
 * Sistema robusto para reiniciar serviços na ordem correta
 */

const Docker = require('dockerode');

class ServiceRestarter {
  constructor(docker, serviceMonitor) {
    this.docker = docker || new Docker();
    this.monitor = serviceMonitor;
    
    // Ordem correta de reinicialização (dependências)
    this.restartOrder = [
      'supabase-db',      // 1. Database primeiro (base de tudo)
      'supabase-kong',    // 2. Gateway (proxy para outros serviços)
      'supabase-auth',    // 3. Auth (autenticação)
      'supabase-rest',    // 4. PostgREST (API REST)
      'supabase-studio'   // 5. Studio por último (interface)
    ];

    console.log('🔄 Service Restarter inicializado');
  }

  /**
   * Reinicia serviços de uma instância
   */
  async restartInstanceServices(instanceId, instance, options = {}) {
    const { forceAll = false, specificService = null } = options;
    const restartLog = [];

    try {
      console.log(`🔄 Iniciando reinicialização de serviços para instância ${instanceId}`);

      // Se serviço específico foi solicitado
      if (specificService) {
        return await this.restartSpecificService(instanceId, specificService, restartLog);
      }

      // Verificar status inicial
      const initialStatus = await this.monitor.checkInstance(instanceId, instance);
      restartLog.push({ 
        step: 'initial_check', 
        status: initialStatus.health,
        timestamp: new Date().toISOString()
      });

      console.log(`📊 Status inicial: ${initialStatus.health.score}% (${initialStatus.health.status})`);

      // Reiniciar serviços na ordem correta
      for (const serviceName of this.restartOrder) {
        const containerName = `${serviceName}-${instanceId}`;
        
        try {
          const containerStatus = initialStatus.containers[containerName];
          const needsRestart = forceAll || !containerStatus?.healthy;

          if (needsRestart) {
            console.log(`🔄 Reiniciando ${containerName}...`);
            
            const restartResult = await this.restartContainer(containerName);
            restartLog.push({ 
              step: 'restart', 
              container: containerName,
              service: serviceName,
              success: restartResult.success,
              duration: restartResult.duration,
              timestamp: new Date().toISOString()
            });

            if (restartResult.success) {
              console.log(`✅ ${containerName} reiniciado com sucesso`);
              // Aguardar entre reinicializações para evitar sobrecarga
              await this.sleep(3000);
            } else {
              console.error(`❌ Falha ao reiniciar ${containerName}: ${restartResult.error}`);
            }
          } else {
            console.log(`⏭️ Pulando ${containerName} (já saudável)`);
            restartLog.push({ 
              step: 'skip', 
              container: containerName,
              service: serviceName,
              reason: 'already_healthy',
              timestamp: new Date().toISOString()
            });
          }
        } catch (error) {
          console.error(`❌ Erro ao processar ${containerName}:`, error);
          restartLog.push({ 
            step: 'error', 
            container: containerName,
            service: serviceName,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Aguardar serviços iniciarem completamente
      console.log('⏳ Aguardando serviços iniciarem...');
      await this.sleep(8000);

      // Verificar status final
      const finalStatus = await this.monitor.checkInstance(instanceId, instance);
      restartLog.push({ 
        step: 'final_check', 
        status: finalStatus.health,
        timestamp: new Date().toISOString()
      });

      const improvement = finalStatus.health.score - initialStatus.health.score;
      const success = improvement >= 0 && finalStatus.health.score > 50;

      console.log(`📊 Status final: ${finalStatus.health.score}% (melhoria: ${improvement > 0 ? '+' : ''}${improvement}%)`);

      return {
        instanceId,
        success: success,
        improvement: improvement,
        initialScore: initialStatus.health.score,
        finalScore: finalStatus.health.score,
        initialStatus: initialStatus.health.status,
        finalStatus: finalStatus.health.status,
        restartLog,
        duration: this.calculateTotalDuration(restartLog),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Erro geral na reinicialização da instância ${instanceId}:`, error);
      return {
        instanceId,
        success: false,
        error: error.message,
        restartLog,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Reinicia serviço específico
   */
  async restartSpecificService(instanceId, serviceName, restartLog = []) {
    const containerName = `supabase-${serviceName}-${instanceId}`;
    
    try {
      console.log(`🔄 Reiniciando serviço específico: ${containerName}`);
      
      const restartResult = await this.restartContainer(containerName);
      restartLog.push({
        step: 'specific_restart',
        container: containerName,
        service: serviceName,
        success: restartResult.success,
        duration: restartResult.duration,
        timestamp: new Date().toISOString()
      });

      // Aguardar serviço iniciar
      await this.sleep(5000);

      return {
        instanceId,
        serviceName,
        containerName,
        success: restartResult.success,
        duration: restartResult.duration,
        restartLog,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Erro ao reiniciar serviço ${serviceName}:`, error);
      return {
        instanceId,
        serviceName,
        containerName,
        success: false,
        error: error.message,
        restartLog,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Reinicia container individual
   */
  async restartContainer(containerName) {
    const startTime = Date.now();
    
    try {
      const container = this.docker.getContainer(containerName);
      
      // Verificar se container existe
      await container.inspect();
      
      // Reiniciar com timeout de 10 segundos
      await container.restart({ t: 10 });
      
      const duration = Date.now() - startTime;
      
      return {
        success: true,
        duration: duration,
        containerName: containerName
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      return {
        success: false,
        duration: duration,
        containerName: containerName,
        error: error.message
      };
    }
  }

  /**
   * Para container (usado em casos extremos)
   */
  async stopContainer(containerName) {
    try {
      const container = this.docker.getContainer(containerName);
      await container.stop({ t: 10 });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Inicia container
   */
  async startContainer(containerName) {
    try {
      const container = this.docker.getContainer(containerName);
      await container.start();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Reinicialização forçada (para + inicia)
   */
  async forceRestartContainer(containerName) {
    const startTime = Date.now();
    
    try {
      console.log(`🔄 Reinicialização forçada: ${containerName}`);
      
      // Parar container
      const stopResult = await this.stopContainer(containerName);
      if (!stopResult.success) {
        console.warn(`⚠️ Erro ao parar ${containerName}: ${stopResult.error}`);
      }

      // Aguardar um pouco
      await this.sleep(2000);

      // Iniciar container
      const startResult = await this.startContainer(containerName);
      const duration = Date.now() - startTime;

      return {
        success: startResult.success,
        duration: duration,
        containerName: containerName,
        error: startResult.error
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        duration: duration,
        containerName: containerName,
        error: error.message
      };
    }
  }

  /**
   * Calcula duração total das operações
   */
  calculateTotalDuration(restartLog) {
    const durations = restartLog
      .filter(log => log.duration)
      .map(log => log.duration);
    
    return durations.length > 0 
      ? durations.reduce((total, duration) => total + duration, 0)
      : 0;
  }

  /**
   * Utilitário para aguardar
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Obtém status de um container específico
   */
  async getContainerStatus(containerName) {
    try {
      const container = this.docker.getContainer(containerName);
      const info = await container.inspect();
      
      return {
        status: info.State.Status,
        running: info.State.Running,
        healthy: info.State.Running && info.State.Status === 'running',
        startedAt: info.State.StartedAt,
        restartCount: info.RestartCount
      };
    } catch (error) {
      return {
        status: 'not_found',
        running: false,
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Lista todos os containers de uma instância
   */
  async listInstanceContainers(instanceId) {
    const containers = {};
    
    for (const serviceName of this.restartOrder) {
      const containerName = `${serviceName}-${instanceId}`;
      containers[serviceName] = await this.getContainerStatus(containerName);
    }
    
    return containers;
  }
}

module.exports = ServiceRestarter;