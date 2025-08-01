/**
 * SQL Security Checker - Validação e proteção de queries SQL
 * MÁXIMA SEGURANÇA: Bloqueia queries perigosas que podem afetar o sistema
 */

class SQLSecurityChecker {
  constructor() {
    this.initializePatterns();
  }

  /**
   * Inicializa padrões perigosos de SQL
   */
  initializePatterns() {
    // Padrões extremamente perigosos - NUNCA permitir
    this.criticalPatterns = [
      /DROP\s+DATABASE/i,
      /DROP\s+SCHEMA/i,
      /ALTER\s+SYSTEM/i,
      /CREATE\s+EXTENSION/i,
      /pg_terminate_backend/i,
      /pg_cancel_backend/i,
      /DELETE\s+FROM\s+pg_/i,
      /UPDATE\s+pg_/i,
      /COPY\s+.*\s+FROM\s+PROGRAM/i,
      /\\\\/i, // Comandos de sistema
      /xp_cmdshell/i,
      /sp_configure/i
    ];

    // Padrões perigosos para auth/system tables
    this.authSystemPatterns = [
      /DELETE\s+FROM\s+auth\./i,
      /TRUNCATE\s+auth\./i,
      /DROP\s+TABLE\s+auth\./i,
      /ALTER\s+TABLE\s+auth\.users/i,
      /DELETE\s+FROM\s+storage\./i,
      /TRUNCATE\s+storage\./i,
      /DELETE\s+FROM\s+realtime\./i
    ];

    // Padrões suspeitos que podem indicar injection
    this.injectionPatterns = [
      /;\s*DROP/i,
      /;\s*DELETE/i,
      /;\s*UPDATE/i,
      /UNION\s+SELECT.*FROM\s+information_schema/i,
      /1=1/,
      /'.*OR.*'.*=.*'/i,
      /--.*password/i,
      /\/\*.*\*\//
    ];

    // Funções perigosas
    this.dangerousFunctions = [
      /pg_read_file/i,
      /pg_write_file/i,
      /pg_execute_server_program/i,
      /lo_import/i,
      /lo_export/i,
      /dblink/i,
      /pg_stat_file/i
    ];
  }

  /**
   * Valida query SQL completa
   */
  validateQuery(query, permissions, userContext = {}) {
    try {
      // Log da tentativa de validação
      console.log(`🔍 Validando SQL para usuário ${userContext.userId}: ${query.substring(0, 100)}...`);

      // Verificações básicas
      this.checkBasicSecurity(query);
      
      // Verificar padrões críticos
      this.checkCriticalPatterns(query);
      
      // Verificar padrões de auth/system
      this.checkAuthSystemPatterns(query);
      
      // Verificar injection patterns
      this.checkInjectionPatterns(query);
      
      // Verificar funções perigosas
      this.checkDangerousFunctions(query);
      
      // Verificar permissões específicas
      this.checkPermissions(query, permissions);
      
      // Verificar tamanho da query
      this.checkQuerySize(query, permissions.sql_restrictions?.max_query_size || 8192);
      
      // Análise estrutural da query
      this.analyzeQueryStructure(query, permissions);

      console.log(`✅ Query SQL aprovada na validação de segurança`);
      return true;
    } catch (error) {
      console.error(`❌ Query SQL rejeitada: ${error.message}`);
      // Log detalhado para auditoria
      this.logSecurityViolation(query, error.message, userContext);
      throw error;
    }
  }

  /**
   * Verificações básicas de segurança
   */
  checkBasicSecurity(query) {
    if (!query || typeof query !== 'string') {
      throw new Error('Query SQL inválida');
    }

    if (query.trim().length === 0) {
      throw new Error('Query SQL vazia');
    }

    // Verificar caracteres suspeitos
    if (query.includes('\x00') || query.includes('\x1a')) {
      throw new Error('Query contém caracteres nulos suspeitos');
    }
  }

  /**
   * Verifica padrões críticos
   */
  checkCriticalPatterns(query) {
    for (const pattern of this.criticalPatterns) {
      if (pattern.test(query)) {
        throw new Error(`Query contém padrão crítico bloqueado: ${pattern.source}`);
      }
    }
  }

  /**
   * Verifica padrões de auth/system
   */
  checkAuthSystemPatterns(query) {
    for (const pattern of this.authSystemPatterns) {
      if (pattern.test(query)) {
        throw new Error(`Query tenta modificar tabelas de sistema/auth: ${pattern.source}`);
      }
    }
  }

  /**
   * Verifica padrões de SQL injection
   */
  checkInjectionPatterns(query) {
    for (const pattern of this.injectionPatterns) {
      if (pattern.test(query)) {
        throw new Error(`Query contém padrão suspeito de SQL injection: ${pattern.source}`);
      }
    }
  }

  /**
   * Verifica funções perigosas
   */
  checkDangerousFunctions(query) {
    for (const pattern of this.dangerousFunctions) {
      if (pattern.test(query)) {
        throw new Error(`Query usa função perigosa bloqueada: ${pattern.source}`);
      }
    }
  }

  /**
   * Verifica permissões específicas
   */
  checkPermissions(query, permissions) {
    const restrictions = permissions.sql_restrictions;
    if (!restrictions) return;

    // Verificar operações permitidas
    if (restrictions.allowed_operations && !restrictions.allowed_operations.includes('*')) {
      const queryType = this.detectQueryType(query);
      if (!restrictions.allowed_operations.includes(queryType)) {
        throw new Error(`Operação ${queryType} não permitida para este nível de permissão`);
      }
    }

    // Verificar padrões bloqueados específicos
    if (restrictions.blocked_patterns) {
      for (const pattern of restrictions.blocked_patterns) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(query)) {
          throw new Error(`Query contém padrão bloqueado: ${pattern}`);
        }
      }
    }

    // Verificar schemas permitidos
    if (restrictions.allowed_schemas) {
      const schemas = this.extractSchemas(query);
      for (const schema of schemas) {
        if (schema !== 'public' && !restrictions.allowed_schemas.includes(schema)) {
          throw new Error(`Acesso ao schema '${schema}' não permitido`);
        }
      }
    }

    // Verificar tabelas bloqueadas
    if (restrictions.blocked_tables) {
      const tables = this.extractTables(query);
      for (const table of tables) {
        for (const blockedPattern of restrictions.blocked_tables) {
          const regex = new RegExp(blockedPattern.replace('*', '.*'), 'i');
          if (regex.test(table)) {
            throw new Error(`Acesso à tabela '${table}' não permitido`);
          }
        }
      }
    }
  }

  /**
   * Verifica tamanho da query
   */
  checkQuerySize(query, maxSize) {
    if (query.length > maxSize) {
      throw new Error(`Query muito grande: ${query.length} bytes (máximo: ${maxSize})`);
    }
  }

  /**
   * Análise estrutural da query
   */
  analyzeQueryStructure(query, permissions) {
    // Verificar número de statements
    const statements = query.split(';').filter(s => s.trim().length > 0);
    if (statements.length > 5) {
      throw new Error('Muitos statements em uma única query (máximo: 5)');
    }

    // Verificar queries aninhadas suspeitas
    const subqueryCount = (query.match(/\(\s*SELECT/gi) || []).length;
    if (subqueryCount > 3) {
      throw new Error('Muitas subqueries aninhadas (máximo: 3)');
    }

    // Verificar JOINs excessivos
    const joinCount = (query.match(/\s+JOIN\s+/gi) || []).length;
    if (joinCount > 10) {
      throw new Error('Muitos JOINs em uma query (máximo: 10)');
    }
  }

  /**
   * Detecta tipo da query
   */
  detectQueryType(query) {
    const trimmed = query.trim().toUpperCase();
    
    if (trimmed.startsWith('SELECT')) return 'SELECT';
    if (trimmed.startsWith('INSERT')) return 'INSERT';
    if (trimmed.startsWith('UPDATE')) return 'UPDATE';
    if (trimmed.startsWith('DELETE')) return 'DELETE';
    if (trimmed.startsWith('CREATE TABLE')) return 'CREATE TABLE';
    if (trimmed.startsWith('ALTER TABLE')) return 'ALTER TABLE';
    if (trimmed.startsWith('DROP TABLE')) return 'DROP TABLE';
    if (trimmed.startsWith('CREATE INDEX')) return 'CREATE INDEX';
    if (trimmed.startsWith('CREATE')) return 'CREATE';
    if (trimmed.startsWith('ALTER')) return 'ALTER';
    if (trimmed.startsWith('DROP')) return 'DROP';
    if (trimmed.startsWith('TRUNCATE')) return 'TRUNCATE';
    
    return 'UNKNOWN';
  }

  /**
   * Extrai schemas mencionados na query
   */
  extractSchemas(query) {
    const schemaPattern = /(\w+)\.\w+/g;
    const schemas = new Set();
    let match;
    
    while ((match = schemaPattern.exec(query)) !== null) {
      const schema = match[1].toLowerCase();
      if (schema !== 'public') {
        schemas.add(schema);
      }
    }
    
    return Array.from(schemas);
  }

  /**
   * Extrai tabelas mencionadas na query
   */
  extractTables(query) {
    const tables = new Set();
    
    // Padrões para encontrar tabelas
    const tablePatterns = [
      /FROM\s+(\w+(?:\.\w+)?)/gi,
      /JOIN\s+(\w+(?:\.\w+)?)/gi,
      /UPDATE\s+(\w+(?:\.\w+)?)/gi,
      /INSERT\s+INTO\s+(\w+(?:\.\w+)?)/gi,
      /DELETE\s+FROM\s+(\w+(?:\.\w+)?)/gi,
      /CREATE\s+TABLE\s+(\w+(?:\.\w+)?)/gi,
      /ALTER\s+TABLE\s+(\w+(?:\.\w+)?)/gi,
      /DROP\s+TABLE\s+(\w+(?:\.\w+)?)/gi
    ];
    
    for (const pattern of tablePatterns) {
      let match;
      while ((match = pattern.exec(query)) !== null) {
        tables.add(match[1].toLowerCase());
      }
    }
    
    return Array.from(tables);
  }

  /**
   * Log de violação de segurança para auditoria
   */
  logSecurityViolation(query, reason, userContext) {
    const violation = {
      timestamp: new Date().toISOString(),
      user_id: userContext.userId,
      instance_id: userContext.instanceId,
      webhook_id: userContext.webhookId,
      ip_address: userContext.ipAddress,
      user_agent: userContext.userAgent,
      query_hash: require('crypto').createHash('sha256').update(query).digest('hex'),
      query_preview: query.substring(0, 200),
      violation_reason: reason,
      severity: this.getSeverityLevel(reason)
    };

    // Log para console e arquivo
    console.error('🚨 VIOLAÇÃO DE SEGURANÇA SQL:', violation);
    
    // TODO: Salvar em arquivo de log específico para violações
    // TODO: Alertar administradores em casos críticos
  }

  /**
   * Determina nível de severidade da violação
   */
  getSeverityLevel(reason) {
    if (reason.includes('crítico') || reason.includes('sistema') || reason.includes('DROP DATABASE')) {
      return 'CRITICAL';
    }
    if (reason.includes('auth') || reason.includes('injection') || reason.includes('perigosa')) {
      return 'HIGH';
    }
    if (reason.includes('permitida') || reason.includes('schema')) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  /**
   * Sanitiza query para log (remove dados sensíveis)
   */
  sanitizeQueryForLog(query) {
    return query
      .replace(/password\s*=\s*'[^']*'/gi, "password='***'")
      .replace(/token\s*=\s*'[^']*'/gi, "token='***'")
      .replace(/'[^']{32,}'/g, "'***'"); // Remove strings longas que podem ser tokens
  }
}

module.exports = SQLSecurityChecker;