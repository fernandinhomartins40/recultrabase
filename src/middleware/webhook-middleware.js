/**
 * Webhook Middleware - Middleware de segurança isolado para webhooks
 * ISOLAMENTO TOTAL: Pool de conexões e recursos separados
 */

const SQLWebhookManager = require('../webhooks/sql-webhook-manager');
const SQLSecurityChecker = require('../webhooks/sql-security-checker');
const { Pool } = require('pg');

// Pool de conexões ISOLADO para webhooks (não afeta sistema principal)
const webhookPools = new Map();
const webhookManager = new SQLWebhookManager();
const securityChecker = new SQLSecurityChecker();

/**
 * Middleware de autenticação webhook
 */
async function webhookAuth(req, res, next) {
  try {
    const token = req.query.token || req.headers['x-webhook-token'];
    const instanceId = req.params.instanceId;

    if (!token) {
      return res.status(401).json({ 
        error: 'Token de webhook obrigatório',
        code: 'WEBHOOK_TOKEN_MISSING'
      });
    }

    if (!instanceId) {
      return res.status(400).json({ 
        error: 'ID da instância obrigatório',
        code: 'INSTANCE_ID_MISSING'
      });
    }

    // Validar webhook
    const webhook = await webhookManager.validateWebhook(token, instanceId);
    
    // Verificar rate limits
    await webhookManager.checkRateLimit(webhook);

    // Anexar contexto do webhook à requisição
    req.webhook_context = {
      webhook: webhook,
      webhookId: webhook.id,
      userId: webhook.user_id,
      instanceId: instanceId,
      permissions: webhook,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent']
    };

    console.log(`🔗 Webhook autenticado: ${webhook.id} para instância ${instanceId}`);
    next();
  } catch (error) {
    console.error('❌ Falha na autenticação webhook:', error);
    res.status(401).json({ 
      error: error.message,
      code: 'WEBHOOK_AUTH_FAILED'
    });
  }
}

/**
 * Middleware de rate limiting para webhooks
 */
async function rateLimitWebhook(req, res, next) {
  try {
    const webhook = req.webhook_context.webhook;
    
    // Verificar rate limits novamente (double-check)
    await webhookManager.checkRateLimit(webhook);
    
    next();
  } catch (error) {
    console.error('❌ Rate limit excedido:', error);
    res.status(429).json({ 
      error: error.message,
      code: 'RATE_LIMIT_EXCEEDED',
      retry_after: 60 // segundos
    });
  }
}

/**
 * Middleware de validação SQL
 */
async function sqlSecurityCheck(req, res, next) {
  try {
    const { query } = req.body;
    const { webhook_context } = req;

    if (!query) {
      return res.status(400).json({ 
        error: 'Query SQL obrigatória',
        code: 'SQL_QUERY_MISSING'
      });
    }

    // Validar query com o security checker
    await securityChecker.validateQuery(query, webhook_context.permissions, {
      userId: webhook_context.userId,
      instanceId: webhook_context.instanceId,
      webhookId: webhook_context.webhookId,
      ipAddress: webhook_context.ipAddress,
      userAgent: webhook_context.userAgent
    });

    next();
  } catch (error) {
    console.error('❌ Query SQL rejeitada pela validação de segurança:', error);
    res.status(400).json({ 
      error: error.message,
      code: 'SQL_SECURITY_VIOLATION',
      query_rejected: true
    });
  }
}

/**
 * Middleware de auditoria
 */
async function auditWebhookRequest(req, res, next) {
  const startTime = Date.now();
  const { webhook_context } = req;
  const { query } = req.body;

  // Log da requisição
  const auditLog = {
    timestamp: new Date().toISOString(),
    webhook_id: webhook_context.webhookId,
    user_id: webhook_context.userId,
    instance_id: webhook_context.instanceId,
    ip_address: webhook_context.ipAddress,
    user_agent: webhook_context.userAgent,
    query_hash: require('crypto').createHash('sha256').update(query || '').digest('hex'),
    query_preview: (query || '').substring(0, 100),
    method: req.method,
    url: req.url
  };

  console.log('📝 Webhook Request Audit:', auditLog);

  // Interceptar resposta para audit completo
  const originalSend = res.send;
  res.send = function(data) {
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    const responseAudit = {
      ...auditLog,
      response_time_ms: responseTime,
      status_code: res.statusCode,
      success: res.statusCode < 400,
      response_size: Buffer.byteLength(data)
    };

    console.log('📝 Webhook Response Audit:', responseAudit);

    // Registrar uso do webhook
    webhookManager.recordWebhookUsage(
      webhook_context.webhook, 
      res.statusCode < 400
    ).catch(err => console.error('Erro ao registrar uso do webhook:', err));

    // TODO: Salvar em arquivo de audit log
    // TODO: Enviar métricas para sistema de monitoramento

    originalSend.call(this, data);
  };

  next();
}

/**
 * Obtém pool de conexões isolado para webhook
 */
function getWebhookPool(instanceId, instanceConfig) {
  if (!webhookPools.has(instanceId)) {
    // Pool ISOLADO com limites baixos para não afetar sistema principal
    const pool = new Pool({
      host: process.env.EXTERNAL_IP || 'localhost',
      port: instanceConfig.ports.postgres_ext,
      database: 'postgres',
      user: 'postgres',
      password: instanceConfig.credentials.postgres_password,
      
      // Configurações de isolamento
      max: 3, // Máximo 3 conexões por instância para webhooks
      min: 0, // Não manter conexões ociosas
      idleTimeoutMillis: 10000, // 10 segundos timeout
      connectionTimeoutMillis: 5000, // 5 segundos para conectar
      acquireTimeoutMillis: 8000, // 8 segundos para obter conexão
      
      // Configurações de segurança
      statement_timeout: 30000, // 30 segundos máximo por query
      query_timeout: 30000,
      
      // Log de conexões
      log: (msg) => console.log(`📊 Webhook Pool ${instanceId}:`, msg)
    });

    // Eventos do pool para monitoramento
    pool.on('connect', () => {
      console.log(`🔗 Nova conexão webhook para instância ${instanceId}`);
    });

    pool.on('error', (err) => {
      console.error(`❌ Erro no pool webhook ${instanceId}:`, err);
    });

    pool.on('remove', () => {
      console.log(`🔌 Conexão webhook removida da instância ${instanceId}`);
    });

    webhookPools.set(instanceId, pool);
  }

  return webhookPools.get(instanceId);
}

/**
 * Executa SQL via webhook com isolamento total
 */
async function executeSQLWebhook(instanceId, query, webhookContext) {
  // Obter configuração da instância do sistema principal (read-only)
  const instanceManager = require('../server.js').manager; // Referência segura
  const instance = instanceManager.instances[instanceId];
  
  if (!instance) {
    throw new Error('Instância não encontrada');
  }

  // Pool isolado para webhook
  const pool = getWebhookPool(instanceId, instance);
  
  try {
    console.log(`🔍 Executando SQL webhook na instância ${instanceId}`);
    
    // Executar query com timeout
    const result = await pool.query(query);
    
    console.log(`✅ SQL webhook executado com sucesso: ${result.rowCount} rows affected`);
    
    return {
      success: true,
      rowCount: result.rowCount,
      rows: result.rows,
      command: result.command,
      fields: result.fields?.map(f => ({ name: f.name, dataTypeID: f.dataTypeID }))
    };
  } catch (error) {
    console.error(`❌ Erro na execução SQL webhook:`, error);
    throw new Error(`Erro na execução SQL: ${error.message}`);
  }
}

/**
 * Limpa pools de webhook inativos
 */
async function cleanupWebhookPools() {
  console.log('🧹 Limpando pools de webhook inativos...');
  
  for (const [instanceId, pool] of webhookPools) {
    try {
      // Verificar se pool está sendo usado
      if (pool.totalCount === 0) {
        await pool.end();
        webhookPools.delete(instanceId);
        console.log(`🗑️ Pool webhook removido para instância ${instanceId}`);
      }
    } catch (error) {
      console.error(`Erro ao limpar pool webhook ${instanceId}:`, error);
    }
  }
}

// Limpeza periódica de pools (a cada 5 minutos)
setInterval(cleanupWebhookPools, 5 * 60 * 1000);

module.exports = {
  webhookAuth,
  rateLimitWebhook,
  sqlSecurityCheck,
  auditWebhookRequest,
  executeSQLWebhook,
  getWebhookPool,
  cleanupWebhookPools
};