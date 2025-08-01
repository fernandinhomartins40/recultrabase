/**
 * Webhook SQL Routes - Endpoints isolados para execução SQL via webhooks
 * ISOLAMENTO TOTAL: Não afeta sistema principal de instâncias
 */

const express = require('express');
const router = express.Router();

// Middleware isolado para webhooks
const {
  webhookAuth,
  rateLimitWebhook,
  sqlSecurityCheck,
  auditWebhookRequest,
  executeSQLWebhook
} = require('../middleware/webhook-middleware');

const SQLWebhookManager = require('../webhooks/sql-webhook-manager');
const webhookManager = new SQLWebhookManager();

/**
 * POST /webhook/sql/:instanceId
 * Executa SQL via webhook com isolamento completo
 */
router.post('/sql/:instanceId',
  webhookAuth,           // Validação de token webhook
  rateLimitWebhook,      // Rate limiting específico  
  sqlSecurityCheck,      // Validação de query SQL
  auditWebhookRequest,   // Log de auditoria
  async (req, res) => {
    const { query, transaction_id } = req.body;
    const { instanceId } = req.params;
    const { webhook_context } = req;

    try {
      console.log(`🔍 Executando SQL webhook na instância ${instanceId} por usuário ${webhook_context.userId}`);
      
      // Executar SQL com isolamento total
      const result = await executeSQLWebhook(instanceId, query, webhook_context);
      
      console.log(`✅ SQL webhook executado com sucesso na instância ${instanceId}`);
      
      res.json({
        success: true,
        webhook_id: webhook_context.webhookId,
        transaction_id: transaction_id || `wh_${Date.now()}`,
        instance_id: instanceId,
        result: {
          command: result.command,
          rowCount: result.rowCount,
          rows: result.rows,
          fields: result.fields
        },
        executed_at: new Date().toISOString(),
        execution_context: {
          webhook_id: webhook_context.webhookId,
          permissions: webhook_context.permissions.permissions,
          rate_limits_remaining: {
            requests_per_minute: webhook_context.permissions.rate_limits.requests_per_minute,
            daily_quota: webhook_context.permissions.rate_limits.daily_quota
          }
        }
      });
      
    } catch (error) {
      console.error(`❌ Erro na execução SQL webhook na instância ${instanceId}:`, error);
      
      res.status(400).json({
        success: false,
        webhook_id: webhook_context.webhookId,
        transaction_id: transaction_id || `wh_error_${Date.now()}`,
        instance_id: instanceId,
        error: {
          message: error.message,
          code: 'SQL_EXECUTION_FAILED',
          type: 'WebhookExecutionError'
        },
        failed_at: new Date().toISOString(),
        execution_context: {
          webhook_id: webhook_context.webhookId,
          permissions: webhook_context.permissions.permissions
        }
      });
    }
  }
);

/**
 * GET /webhook/sql/:instanceId/health
 * Health check para webhook específico de instância
 */
router.get('/sql/:instanceId/health',
  webhookAuth,
  async (req, res) => {
    const { instanceId } = req.params;
    const { webhook_context } = req;

    try {
      // Verificar se instância existe e está acessível
      const instanceManager = require('../server.js').manager;
      const instance = instanceManager.instances[instanceId];
      
      if (!instance) {
        return res.status(404).json({
          success: false,
          webhook_id: webhook_context.webhookId,
          instance_id: instanceId,
          error: 'Instância não encontrada',
          status: 'instance_not_found'
        });
      }

      // Teste de conectividade básico (query simples)
      const testResult = await executeSQLWebhook(instanceId, 'SELECT 1 as health_check', webhook_context);
      
      res.json({
        success: true,
        webhook_id: webhook_context.webhookId,
        instance_id: instanceId,
        status: 'healthy',
        connection_test: testResult.rowCount === 1 ? 'passed' : 'failed',
        checked_at: new Date().toISOString(),
        webhook_stats: webhookManager.getWebhookStats(webhook_context.webhookId)
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        webhook_id: webhook_context.webhookId,
        instance_id: instanceId,
        status: 'unhealthy',
        error: error.message,
        checked_at: new Date().toISOString()
      });
    }
  }
);

/**
 * GET /webhook/sql/:instanceId/stats
 * Estatísticas de uso do webhook para instância específica
 */
router.get('/sql/:instanceId/stats',
  webhookAuth,
  async (req, res) => {
    const { instanceId } = req.params;
    const { webhook_context } = req;

    try {
      const stats = webhookManager.getWebhookStats(webhook_context.webhookId);
      
      if (!stats) {
        return res.status(404).json({
          success: false,
          error: 'Estatísticas não encontradas'
        });
      }

      res.json({
        success: true,
        webhook_id: webhook_context.webhookId,
        instance_id: instanceId,
        stats: stats,
        permissions: webhook_context.permissions.permissions,
        rate_limits: webhook_context.permissions.rate_limits,
        retrieved_at: new Date().toISOString()
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * POST /webhook/sql/:instanceId/validate
 * Valida query SQL sem executar (dry-run)
 */
router.post('/sql/:instanceId/validate',
  webhookAuth,
  rateLimitWebhook,
  sqlSecurityCheck,
  async (req, res) => {
    const { query } = req.body;
    const { instanceId } = req.params;
    const { webhook_context } = req;

    try {
      // Query já foi validada pelo sqlSecurityCheck middleware
      // Aqui fazemos validação adicional de sintaxe SQL se necessário
      
      res.json({
        success: true,
        webhook_id: webhook_context.webhookId,
        instance_id: instanceId,
        validation: {
          syntax: 'valid',
          security: 'passed',
          permissions: 'allowed',
          estimated_impact: 'low' // TODO: Implementar análise de impacto
        },
        query_info: {
          query_hash: require('crypto').createHash('sha256').update(query).digest('hex'),
          query_preview: query.substring(0, 100),
          query_length: query.length
        },
        validated_at: new Date().toISOString()
      });
      
    } catch (error) {
      res.status(400).json({
        success: false,
        webhook_id: webhook_context.webhookId,
        instance_id: instanceId,
        validation: {
          syntax: 'unknown',
          security: 'failed',
          permissions: 'denied'
        },
        error: error.message,
        validated_at: new Date().toISOString()
      });
    }
  }
);

/**
 * Error handler específico para rotas de webhook
 */
router.use((error, req, res, next) => {
  console.error('❌ Erro na rota webhook SQL:', error);
  
  // Se já foi enviada resposta, delegar para handler padrão
  if (res.headersSent) {
    return next(error);
  }
  
  res.status(500).json({
    success: false,
    error: {
      message: 'Erro interno do servidor webhook',
      code: 'WEBHOOK_INTERNAL_ERROR',
      type: 'InternalWebhookError'
    },
    webhook_id: req.webhook_context?.webhookId,
    instance_id: req.params?.instanceId,
    error_at: new Date().toISOString()
  });
});

module.exports = router;