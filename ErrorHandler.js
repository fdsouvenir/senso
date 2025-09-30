/**
 * @OnlyCurrentDoc
 *
 * Error Handler and Logging System
 * Provides centralized error handling, logging, and notification services
 */

const ErrorHandler = {
  /**
   * Log levels
   */
  LEVELS: {
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
    CRITICAL: 'CRITICAL'
  },

  /**
   * Handle and log an error
   * @param {Error|string} error The error object or message
   * @param {string} context Where the error occurred
   * @param {Object} metadata Additional metadata
   * @param {boolean} notify Whether to send email notification
   */
  handleError(error, context, metadata = {}, notify = false) {
    const errorDetails = this.formatError(error, context, metadata);

    // Log to console
    console.error(errorDetails);

    // Log to BigQuery
    this.logToBigQuery(this.LEVELS.ERROR, context, errorDetails.message, metadata, errorDetails.stack);

    // Send notification if critical
    if (notify || errorDetails.isCritical) {
      this.sendNotification(errorDetails);
    }

    // Return formatted error for handling
    return errorDetails;
  },

  /**
   * Format error details
   * @param {Error|string} error The error
   * @param {string} context Error context
   * @param {Object} metadata Additional data
   * @returns {Object} Formatted error details
   */
  formatError(error, context, metadata) {
    const isError = error instanceof Error;

    return {
      message: isError ? error.message : error.toString(),
      stack: isError ? error.stack : null,
      context: context,
      metadata: metadata,
      timestamp: new Date().toISOString(),
      isCritical: this.isCriticalError(error, context),
      executionId: this.getExecutionId()
    };
  },

  /**
   * Determine if error is critical
   * @param {Error|string} error The error
   * @param {string} context Error context
   * @returns {boolean} Whether error is critical
   */
  isCriticalError(error, context) {
    const criticalPatterns = [
      /quota/i,
      /authentication/i,
      /authorization/i,
      /bigquery/i,
      /timeout/i,
      /invalid.*key/i,
      /rate.*limit/i
    ];

    const errorString = error.toString().toLowerCase();
    return criticalPatterns.some(pattern => pattern.test(errorString));
  },

  /**
   * Send error notification email
   * @param {Object} errorDetails Error details object
   */
  sendNotification(errorDetails) {
    if (!Config.SYSTEM.errorNotificationEnabled) {
      return;
    }

    try {
      const recipient = Session.getActiveUser().getEmail();
      const subject = `⚠️ Senso Analytics Error: ${errorDetails.context}`;

      const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
    .header { background: #EA4335; color: white; padding: 15px; margin: -20px -20px 20px -20px; border-radius: 8px 8px 0 0; }
    .error-box { background: #FFF3E0; border-left: 4px solid #FF9800; padding: 15px; margin: 20px 0; }
    .stack-trace { background: #f5f5f5; padding: 15px; font-family: monospace; font-size: 12px; overflow-x: auto; }
    .metadata { background: #f8f9fa; padding: 15px; margin: 20px 0; }
    .timestamp { color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>⚠️ Error Alert</h2>
    </div>

    <div class="error-box">
      <h3>Error Context: ${errorDetails.context}</h3>
      <p><strong>Message:</strong> ${errorDetails.message}</p>
      <p class="timestamp">Occurred at: ${errorDetails.timestamp}</p>
    </div>

    ${errorDetails.metadata && Object.keys(errorDetails.metadata).length > 0 ? `
      <div class="metadata">
        <h4>Additional Information:</h4>
        ${Object.entries(errorDetails.metadata).map(([key, value]) =>
          `<p><strong>${key}:</strong> ${JSON.stringify(value)}</p>`
        ).join('')}
      </div>
    ` : ''}

    ${errorDetails.stack ? `
      <div>
        <h4>Stack Trace:</h4>
        <div class="stack-trace">${errorDetails.stack.replace(/\n/g, '<br>')}</div>
      </div>
    ` : ''}

    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
      <p style="color: #666; font-size: 14px;">
        This is an automated error notification from your Senso Analytics system.
        Please review the error details and take appropriate action if needed.
      </p>
    </div>
  </div>
</body>
</html>
      `;

      MailApp.sendEmail({
        to: recipient,
        subject: subject,
        htmlBody: htmlBody
      });

      Logger.log(`Error notification sent to ${recipient}`);
    } catch (notificationError) {
      // Log but don't throw to avoid cascading errors
      Logger.log(`Failed to send error notification: ${notificationError.toString()}`);
    }
  },

  /**
   * Log message with level
   * @param {string} level Log level
   * @param {string} context Component/context
   * @param {string} message Log message
   * @param {Object} metadata Additional metadata
   */
  log(level, context, message, metadata = {}) {
    // Check if level meets threshold
    const levels = Object.values(this.LEVELS);
    const currentLevel = levels.indexOf(Config.SYSTEM.loggingLevel || this.LEVELS.INFO);
    const messageLevel = levels.indexOf(level);

    if (messageLevel < currentLevel) {
      return; // Skip if below threshold
    }

    // Console log
    const logMessage = `[${level}] [${context}] ${message}`;
    switch (level) {
      case this.LEVELS.ERROR:
      case this.LEVELS.CRITICAL:
        console.error(logMessage, metadata);
        break;
      case this.LEVELS.WARN:
        console.warn(logMessage, metadata);
        break;
      default:
        console.log(logMessage, metadata);
    }

    // Log to BigQuery for persistent storage
    this.logToBigQuery(level, context, message, metadata);
  },

  /**
   * Convenience methods for different log levels
   */
  debug(context, message, metadata) {
    this.log(this.LEVELS.DEBUG, context, message, metadata);
  },

  info(context, message, metadata) {
    this.log(this.LEVELS.INFO, context, message, metadata);
  },

  warn(context, message, metadata) {
    this.log(this.LEVELS.WARN, context, message, metadata);
  },

  error(context, message, metadata) {
    this.log(this.LEVELS.ERROR, context, message, metadata);
  },

  critical(context, message, metadata) {
    this.log(this.LEVELS.CRITICAL, context, message, metadata);
  },

  /**
   * Log to BigQuery for persistence and analysis
   * @param {string} level Log level
   * @param {string} component Component name
   * @param {string} message Log message
   * @param {Object} metadata Additional metadata
   * @param {string} errorStack Error stack trace
   */
  logToBigQuery(level, component, message, metadata = {}, errorStack = null) {
    try {
      const row = {
        log_id: Utilities.getUuid(),
        level: level,
        component: component,
        message: message.substring(0, 1000), // Truncate long messages
        metadata: metadata ? JSON.stringify(metadata) : null,
        error_stack: errorStack ? errorStack.substring(0, 5000) : null, // Truncate stack traces
        execution_id: this.getExecutionId(),
        timestamp: new Date().toISOString()
      };

      const request = {
        rows: [{ json: row }],
        skipInvalidRows: false,
        ignoreUnknownValues: false
      };

      BigQuery.Tabledata.insertAll(
        request,
        Config.GCP_PROJECT_ID,
        Config.BIGQUERY_DATASET,
        'system_logs'
      );
    } catch (logError) {
      // Fallback to console if BigQuery logging fails
      console.error('Failed to log to BigQuery:', logError);
    }
  },

  /**
   * Get current execution ID for tracking related logs
   * @returns {string} Execution ID
   */
  getExecutionId() {
    // Cache execution ID for this run
    if (!this.executionId) {
      this.executionId = Utilities.getUuid();
    }
    return this.executionId;
  },

  /**
   * Create a wrapped function with error handling
   * @param {Function} fn Function to wrap
   * @param {string} context Context name
   * @returns {Function} Wrapped function
   */
  wrap(fn, context) {
    return (...args) => {
      try {
        const startTime = Date.now();
        const result = fn.apply(this, args);

        // Log successful execution if in debug mode
        if (Config.SYSTEM.loggingLevel === this.LEVELS.DEBUG) {
          const duration = Date.now() - startTime;
          this.debug(context, `Executed successfully`, { duration: `${duration}ms` });
        }

        return result;
      } catch (error) {
        this.handleError(error, context, { args: args }, true);
        throw error; // Re-throw after handling
      }
    };
  },

  /**
   * Monitor execution time and alert if threshold exceeded
   * @param {string} context Operation context
   * @returns {Object} Timer object with end() method
   */
  startTimer(context) {
    const startTime = Date.now();
    const maxTime = Config.SYSTEM.executionTimeLimit - Config.SYSTEM.timeBuffer;

    return {
      end: () => {
        const duration = Date.now() - startTime;

        if (duration > maxTime) {
          this.warn(context, `Operation approaching time limit`, {
            duration: `${duration}ms`,
            limit: `${maxTime}ms`
          });
        }

        return duration;
      },

      check: () => {
        const elapsed = Date.now() - startTime;
        if (elapsed > maxTime) {
          throw new Error(`Execution time limit exceeded in ${context}`);
        }
        return elapsed;
      }
    };
  },

  /**
   * Retry a function with exponential backoff
   * @param {Function} fn Function to retry
   * @param {number} maxRetries Maximum retry attempts
   * @param {string} context Context for logging
   * @returns {any} Function result
   */
  async retryWithBackoff(fn, maxRetries = Config.SYSTEM.maxRetries, context = 'Operation') {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries) {
          this.error(context, `Failed after ${maxRetries} attempts`, {
            error: error.toString()
          });
          throw error;
        }

        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        this.warn(context, `Attempt ${attempt} failed, retrying in ${delay}ms`, {
          error: error.toString()
        });

        Utilities.sleep(delay);
      }
    }

    throw lastError;
  },

  /**
   * Clear old logs from BigQuery
   * @param {number} daysToKeep Number of days to keep logs
   */
  cleanupOldLogs(daysToKeep = 30) {
    try {
      const query = `
        DELETE FROM \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.system_logs\`
        WHERE timestamp < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${daysToKeep} DAY)
      `;

      const request = {
        query: query,
        useLegacySql: false
      };

      BigQuery.Jobs.insert(request, Config.GCP_PROJECT_ID);

      this.info('ErrorHandler', `Cleaned up logs older than ${daysToKeep} days`);
    } catch (error) {
      this.error('ErrorHandler', 'Failed to cleanup old logs', { error: error.toString() });
    }
  }
};