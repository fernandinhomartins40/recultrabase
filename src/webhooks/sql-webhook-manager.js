/**
 * SQL Webhook Manager - Sistema isolado de webhooks para execução SQL
 * ISOLAMENTO COMPLETO: Não afeta criação/gerenciamento de instâncias
 */

const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');

class SQLWebhookManager {
  constructor() {
    this.webhooksFile = path.join(__dirname, '../data/sql-webhooks.json');
    this.webhooks = new Map();
    this.loadWebhooks();
  }

  /**
   * Carrega webhooks existentes do arquivo
   */
  async loadWebhooks() {
    try {
      if (await fs.pathExists(this.webhooksFile)) {
        const data = await fs.readJson(this.webhooksFile);
        this.webhooks = new Map(Object.entries(data));
        console.log('🔗 SQL Webhooks carregados:', this.webhooks.size);
      }
    } catch (error) {
      console.error('❌ Erro ao carregar webhooks:', error);
      this.webhooks = new Map();
    }
  }

  /**
   * Salva webhooks no arquivo
   */
  async saveWebhooks() {
    try {
      await fs.ensureDir(path.dirname(this.webhooksFile));
      const data = Object.fromEntries(this.webhooks);
      await fs.writeJson(this.webhooksFile, data, { spaces: 2 });
    } catch (error) {
      console.error('❌ Erro ao salvar webhooks:', error);
    }
  }

  /**
   * Gera token seguro para webhook
   */
  generateSecureToken() {
    const timestamp = Date.now().toString();
    const randomBytes = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(timestamp + randomBytes).digest('hex');
    return `wh_cursor_sql_${hash.substring(0, 32)}`;
  }

  /**
   * Cria novo webhook para execução SQL
   */
  async createWebhook(userId, instanceId, permissions = 'standard', options = {}) {
    try {
      const webhookId = `wh_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
      const token = this.generateSecureToken();
      
      // Configurações de rate limiting baseadas em permissões
      const rateLimits = this.getRateLimitsForPermission(permissions);
      
      const webhook = {
        id: webhookId,
        token: token,
        user_id: userId,
        instance_id: instanceId,
        permissions: permissions,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + (options.expirationDays || 365) * 24 * 60 * 60 * 1000).toISOString(),
        status: 'active',
        rate_limits: rateLimits,
        ip_whitelist: options.ip_whitelist || [],
        usage_stats: {
          total_requests: 0,
          successful_requests: 0,
          failed_requests: 0,
          last_used: null,
          daily_usage: {}
        },
        sql_restrictions: this.getSQLRestrictionsForPermission(permissions),
        metadata: {
          name: options.name || `Cursor Webhook ${instanceId}`,
          description: options.description || 'Webhook para execução SQL via Cursor IDE',
          created_by: userId
        }
      };

      this.webhooks.set(webhookId, webhook);
      await this.saveWebhooks();

      console.log(`🔗 Webhook SQL criado: ${webhookId} para instância ${instanceId}`);
      return webhook;
    } catch (error) {
      console.error('❌ Erro ao criar webhook:', error);
      throw new Error('Falha ao criar webhook SQL');
    }
  }

  /**
   * Valida token de webhook
   */
  async validateWebhook(token, instanceId) {
    try {
      // Buscar webhook por token
      let webhook = null;
      for (const [id, wh] of this.webhooks) {
        if (wh.token === token) {
          webhook = wh;
          break;
        }
      }

      if (!webhook) {
        throw new Error('Token de webhook inválido');
      }

      // Verificar se está ativo
      if (webhook.status !== 'active') {
        throw new Error('Webhook inativo');
      }

      // Verificar expiração
      if (new Date() > new Date(webhook.expires_at)) {
        webhook.status = 'expired';
        await this.saveWebhooks();
        throw new Error('Webhook expirado');
      }

      // Verificar se é para a instância correta
      if (webhook.instance_id !== instanceId) {
        throw new Error('Token não válido para esta instância');
      }

      return webhook;
    } catch (error) {
      console.error('❌ Erro na validação do webhook:', error);
      throw error;
    }
  }

  /**
   * Verifica rate limits
   */
  async checkRateLimit(webhook) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentMinute = Math.floor(now.getTime() / 60000);

    // Inicializar estatísticas do dia se necessário
    if (!webhook.usage_stats.daily_usage[today]) {
      webhook.usage_stats.daily_usage[today] = {
        requests: 0,
        by_minute: {}
      };
    }

    const todayStats = webhook.usage_stats.daily_usage[today];

    // Verificar limite por minuto
    const requestsThisMinute = todayStats.by_minute[currentMinute] || 0;
    if (requestsThisMinute >= webhook.rate_limits.requests_per_minute) {
      throw new Error('Rate limit excedido: requests por minuto');
    }

    // Verificar quota diária
    if (todayStats.requests >= webhook.rate_limits.daily_quota) {
      throw new Error('Quota diária excedida');
    }

    return true;
  }

  /**
   * Registra uso do webhook
   */
  async recordWebhookUsage(webhook, success = true) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentMinute = Math.floor(now.getTime() / 60000);

    // Atualizar estatísticas gerais
    webhook.usage_stats.total_requests++;
    if (success) {
      webhook.usage_stats.successful_requests++;
    } else {
      webhook.usage_stats.failed_requests++;
    }
    webhook.usage_stats.last_used = now.toISOString();

    // Atualizar estatísticas diárias
    if (!webhook.usage_stats.daily_usage[today]) {
      webhook.usage_stats.daily_usage[today] = {
        requests: 0,
        by_minute: {}
      };
    }

    const todayStats = webhook.usage_stats.daily_usage[today];
    todayStats.requests++;
    todayStats.by_minute[currentMinute] = (todayStats.by_minute[currentMinute] || 0) + 1;

    // Limpar estatísticas antigas (manter apenas 30 dias)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    for (const date in webhook.usage_stats.daily_usage) {
      if (date < thirtyDaysAgo) {
        delete webhook.usage_stats.daily_usage[date];
      }
    }

    await this.saveWebhooks();
  }

  /**
   * Lista webhooks de um usuário
   */
  async listUserWebhooks(userId) {
    const userWebhooks = [];
    for (const [id, webhook] of this.webhooks) {
      if (webhook.user_id === userId) {
        // Retornar sem o token por segurança
        const safeWebhook = { ...webhook };
        delete safeWebhook.token;
        userWebhooks.push(safeWebhook);
      }
    }
    return userWebhooks;
  }

  /**
   * Revoga webhook
   */
  async revokeWebhook(webhookId, userId) {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) {
      throw new Error('Webhook não encontrado');
    }

    if (webhook.user_id !== userId) {
      throw new Error('Não autorizado a revogar este webhook');
    }

    webhook.status = 'revoked';
    webhook.revoked_at = new Date().toISOString();
    await this.saveWebhooks();

    console.log(`🔗 Webhook revogado: ${webhookId}`);
    return true;
  }

  /**
   * Gera URL do webhook
   */
  generateWebhookUrl(instanceId, token) {
    const baseUrl = process.env.WEBHOOK_BASE_URL || 'http://localhost:3080';
    return `${baseUrl}/webhook/sql/${instanceId}?token=${token}`;
  }

  /**
   * Define rate limits baseado em permissões
   */
  getRateLimitsForPermission(permission) {
    const limits = {
      read_only: {
        requests_per_minute: 20,
        daily_quota: 500,
        max_concurrent: 2,
        max_query_size: 4096
      },
      standard: {
        requests_per_minute: 30,
        daily_quota: 1000,
        max_concurrent: 3,
        max_query_size: 8192
      },
      developer: {
        requests_per_minute: 50,
        daily_quota: 2000,
        max_concurrent: 5,
        max_query_size: 16384
      },
      admin: {
        requests_per_minute: 100,
        daily_quota: 5000,
        max_concurrent: 10,
        max_query_size: 32768
      }
    };

    return limits[permission] || limits.standard;
  }

  /**
   * Define restrições SQL baseado em permissões
   */
  getSQLRestrictionsForPermission(permission) {
    const restrictions = {
      read_only: {
        allowed_operations: ['SELECT'],
        blocked_patterns: ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'CREATE', 'ALTER', 'TRUNCATE'],
        allowed_schemas: ['public'],
        blocked_tables: ['auth.*', 'storage.*', 'realtime.*']
      },
      standard: {
        allowed_operations: ['SELECT', 'INSERT', 'UPDATE'],
        blocked_patterns: ['DROP DATABASE', 'DROP SCHEMA', 'DELETE FROM auth', 'TRUNCATE auth', 'ALTER SYSTEM'],
        allowed_schemas: ['public'],
        blocked_tables: ['auth.users', 'auth.refresh_tokens', 'storage.*', 'realtime.*']
      },
      developer: {
        allowed_operations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE TABLE', 'ALTER TABLE'],
        blocked_patterns: ['DROP DATABASE', 'DROP SCHEMA', 'DELETE FROM auth', 'ALTER SYSTEM', 'CREATE EXTENSION'],
        allowed_schemas: ['public'],
        blocked_tables: ['auth.users', 'auth.refresh_tokens']
      },
      admin: {
        allowed_operations: ['*'],
        blocked_patterns: ['ALTER SYSTEM', 'pg_terminate_backend'],
        allowed_schemas: ['public', 'custom'],
        blocked_tables: []
      }
    };

    return restrictions[permission] || restrictions.standard;
  }

  /**
   * Obtém estatísticas do webhook
   */
  getWebhookStats(webhookId) {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) return null;

    return {
      id: webhookId,
      total_requests: webhook.usage_stats.total_requests,
      successful_requests: webhook.usage_stats.successful_requests,
      failed_requests: webhook.usage_stats.failed_requests,
      success_rate: webhook.usage_stats.total_requests > 0 
        ? (webhook.usage_stats.successful_requests / webhook.usage_stats.total_requests * 100).toFixed(2)
        : 0,
      last_used: webhook.usage_stats.last_used,
      daily_usage: webhook.usage_stats.daily_usage
    };
  }
}

module.exports = SQLWebhookManager;