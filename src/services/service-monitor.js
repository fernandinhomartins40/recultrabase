/**
 * Service Monitor - Monitor principal de serviços das instâncias
 * Sistema simples e robusto para verificar saúde dos serviços Supabase
 */

const Docker = require('dockerode');
const { Pool } = require('pg');

class ServiceMonitor {
  constructor(config = {}) {
    this.docker = new Docker(config.dockerOptions || {});
    this.cache = new Map(); // Cache simples de status
    this.cacheTimeout = 30000; // 30 segundos de cache
    
    console.log('🔍 Service Monitor inicializado');
  }

  /**
   * Verificação rápida de uma instância
   */
  async checkInstance(instanceId, instance) {
    try {
      // Verificar cache primeiro
      const cached = this.getCachedResult(instanceId);
      if (cached) {
        return cached;
      }

      console.log(`🔍 Verificando saúde da instância ${instanceId}`);

      const checks = {
        containers: await this.checkContainers(instanceId),
        endpoints: await this.checkEndpoints(instanceId, instance),
        database: await this.checkDatabase(instanceId, instance)
      };
      
      const health = this.calculateHealthScore(checks);
      const result = { instanceId, ...checks, health, timestamp: Date.now() };
      
      // Armazenar no cache
      this.cache.set(instanceId, result);
      
      console.log(`✅ Verificação concluída para ${instanceId} - Score: ${health.score}%`);
      return result;

    } catch (error) {
      console.error(`❌ Erro ao verificar instância ${instanceId}:`, error);
      return {
        instanceId,
        containers: {},
        endpoints: {},
        database: { healthy: false, error: error.message },
        health: { score: 0, status: 'error', healthy: 0, total: 0 },
        timestamp: Date.now(),
        error: error.message
      };
    }
  }

  /**
   * Verifica containers Docker
   */
  async checkContainers(instanceId) {
    const requiredContainers = [
      `supabase-db-${instanceId}`,
      `supabase-kong-${instanceId}`,
      `supabase-auth-${instanceId}`,
      `supabase-rest-${instanceId}`,
      `supabase-studio-${instanceId}`
    ];

    const results = {};
    
    for (const containerName of requiredContainers) {
      try {
        const container = this.docker.getContainer(containerName);
        const info = await container.inspect();
        
        results[containerName] = {
          status: info.State.Status,
          running: info.State.Running,
          healthy: info.State.Running && info.State.Status === 'running',
          startedAt: info.State.StartedAt,
          restartCount: info.RestartCount
        };
        
      } catch (error) {
        results[containerName] = { 
          status: 'not_found', 
          running: false, 
          healthy: false,
          error: error.message
        };
      }
    }
    
    return results;
  }

  /**
   * Verifica endpoints HTTP
   */
  async checkEndpoints(instanceId, instance) {
    if (!instance || !instance.ports) {
      return {
        error: 'Configuração de instância não disponível'
      };
    }

    const endpoints = [
      { name: 'studio', url: `http://localhost:${instance.ports.studio}` },
      { name: 'kong', url: `http://localhost:${instance.ports.kong}` },
      { name: 'rest', url: `http://localhost:${instance.ports.kong}/rest/v1/` }
    ];

    const results = {};
    
    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const startTime = Date.now();
        const response = await fetch(endpoint.url, {
          signal: controller.signal,
          method: 'HEAD'
        });
        const responseTime = Date.now() - startTime;
        
        clearTimeout(timeoutId);
        
        results[endpoint.name] = {
          status: response.status,
          healthy: response.status < 500,
          responseTime: responseTime,
          url: endpoint.url
        };
        
      } catch (error) {
        results[endpoint.name] = { 
          status: 'error', 
          healthy: false, 
          error: error.message,
          url: endpoint.url
        };
      }
    }
    
    return results;
  }

  /**
   * Verifica conexão com database
   */
  async checkDatabase(instanceId, instance) {
    if (!instance || !instance.ports || !instance.credentials) {
      return {
        healthy: false,
        error: 'Configuração de instância não disponível'
      };
    }

    let pool = null;
    try {
      // Criar pool temporário para teste
      pool = new Pool({
        host: 'localhost',
        port: instance.ports.postgres_ext,
        database: 'postgres',
        user: 'postgres',
        password: instance.credentials.postgres_password,
        max: 1,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 5000
      });

      const startTime = Date.now();
      const result = await pool.query('SELECT 1 as health_check');
      const responseTime = Date.now() - startTime;

      return {
        healthy: result.rowCount === 1,
        responseTime: responseTime,
        port: instance.ports.postgres_ext
      };

    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        port: instance.ports?.postgres_ext
      };
    } finally {
      if (pool) {
        try {
          await pool.end();
        } catch (endError) {
          console.warn(`Aviso: Erro ao fechar pool de teste: ${endError.message}`);
        }
      }
    }
  }

  /**
   * Calcula score de saúde simples
   */
  calculateHealthScore(checks) {
    let total = 0;
    let healthy = 0;

    // Containers (peso maior)
    const containerValues = Object.values(checks.containers);
    containerValues.forEach(container => {
      total += 2; // Peso 2 para containers
      if (container.healthy) healthy += 2;
    });

    // Endpoints
    const endpointValues = Object.values(checks.endpoints);
    if (!checks.endpoints.error) {
      endpointValues.forEach(endpoint => {
        total++;
        if (endpoint.healthy) healthy++;
      });
    }

    // Database (peso maior)
    total += 2; // Peso 2 para database
    if (checks.database.healthy) healthy += 2;

    const score = total > 0 ? Math.round((healthy / total) * 100) : 0;

    return {
      score: score,
      healthy: healthy,
      total: total,
      status: this.getHealthStatus(score)
    };
  }

  /**
   * Determina status baseado no score
   */
  getHealthStatus(score) {
    if (score >= 90) return 'healthy';
    if (score >= 70) return 'degraded';
    if (score >= 30) return 'unhealthy';
    return 'critical';
  }

  /**
   * Verifica cache válido
   */
  getCachedResult(instanceId) {
    const cached = this.cache.get(instanceId);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached;
    }
    return null;
  }

  /**
   * Limpa cache antigo
   */
  clearOldCache() {
    const now = Date.now();
    for (const [instanceId, result] of this.cache.entries()) {
      if ((now - result.timestamp) > this.cacheTimeout * 2) {
        this.cache.delete(instanceId);
      }
    }
  }

  /**
   * Verifica saúde de múltiplas instâncias
   */
  async checkAllInstances(instances) {
    const results = {};
    const promises = [];

    for (const [instanceId, instance] of Object.entries(instances)) {
      promises.push(
        this.checkInstance(instanceId, instance)
          .then(result => {
            results[instanceId] = result;
          })
          .catch(error => {
            results[instanceId] = {
              instanceId,
              error: error.message,
              health: { score: 0, status: 'error' }
            };
          })
      );
    }

    await Promise.all(promises);
    return results;
  }

  /**
   * Obtém estatísticas de saúde geral
   */
  getHealthStats(results) {
    const stats = {
      total: 0,
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      critical: 0,
      averageScore: 0
    };

    let totalScore = 0;

    for (const result of Object.values(results)) {
      stats.total++;
      totalScore += result.health?.score || 0;

      const status = result.health?.status || 'critical';
      stats[status]++;
    }

    stats.averageScore = stats.total > 0 ? Math.round(totalScore / stats.total) : 0;

    return stats;
  }
}

module.exports = ServiceMonitor;