/**
 * @OnlyCurrentDoc
 *
 * BigQuery Schema Setup for Frontend Analytics
 * This file contains functions to create and update BigQuery tables
 * required for the frontend analytics system.
 */

const SchemaSetup = {
  /**
   * Create all necessary tables for the frontend system
   */
  createAllTables() {
    Logger.log('Starting BigQuery schema setup...');

    try {
      this.createPredictionsTable();
      this.createUserQueriesTable();
      this.createSystemLogsTable();
      this.createEmailEngagementTable();

      Logger.log('Schema setup completed successfully');
      return true;
    } catch (error) {
      Logger.log(`Schema setup failed: ${error.toString()}`);
      return false;
    }
  },

  /**
   * Create predictions_tracking table for storing and tracking predictions
   */
  createPredictionsTable() {
    const tableId = 'predictions_tracking';
    const datasetId = Config.BIGQUERY_DATASET;
    const projectId = Config.GCP_PROJECT_ID;

    const table = {
      tableReference: {
        projectId: projectId,
        datasetId: datasetId,
        tableId: tableId
      },
      schema: {
        fields: [
          { name: 'prediction_id', type: 'STRING', mode: 'REQUIRED', description: 'Unique ID for the prediction' },
          { name: 'prediction_date', type: 'DATE', mode: 'REQUIRED', description: 'Date the prediction was made' },
          { name: 'target_date', type: 'DATE', mode: 'REQUIRED', description: 'Date being predicted' },
          { name: 'prediction_type', type: 'STRING', mode: 'REQUIRED', description: 'Type: daily or weekly' },
          { name: 'predicted_value', type: 'FLOAT64', mode: 'REQUIRED', description: 'Predicted sales amount' },
          { name: 'actual_value', type: 'FLOAT64', mode: 'NULLABLE', description: 'Actual sales amount (filled later)' },
          { name: 'confidence_score', type: 'INTEGER', mode: 'REQUIRED', description: 'Confidence level 1-10' },
          { name: 'reasoning', type: 'STRING', mode: 'NULLABLE', description: 'AI reasoning for prediction' },
          { name: 'context_factors', type: 'STRING', mode: 'NULLABLE', description: 'JSON string of context factors' },
          { name: 'accuracy_percent', type: 'FLOAT64', mode: 'NULLABLE', description: 'Accuracy percentage (calculated)' },
          { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED', description: 'When prediction was created' },
          { name: 'updated_at', type: 'TIMESTAMP', mode: 'NULLABLE', description: 'When accuracy was calculated' }
        ]
      },
      timePartitioning: {
        type: 'DAY',
        field: 'target_date'
      },
      description: 'Tracks AI predictions and their accuracy over time'
    };

    try {
      BigQuery.Tables.insert(table, projectId, datasetId);
      Logger.log(`Created table: ${tableId}`);
    } catch (error) {
      if (error.message.includes('Already Exists')) {
        Logger.log(`Table ${tableId} already exists`);
      } else {
        throw error;
      }
    }
  },

  /**
   * Create user_queries table for tracking Q&A interactions
   */
  createUserQueriesTable() {
    const tableId = 'user_queries';
    const datasetId = Config.BIGQUERY_DATASET;
    const projectId = Config.GCP_PROJECT_ID;

    const table = {
      tableReference: {
        projectId: projectId,
        datasetId: datasetId,
        tableId: tableId
      },
      schema: {
        fields: [
          { name: 'query_id', type: 'STRING', mode: 'REQUIRED', description: 'Unique query ID' },
          { name: 'user_email', type: 'STRING', mode: 'REQUIRED', description: 'User who made the query' },
          { name: 'question', type: 'STRING', mode: 'REQUIRED', description: 'Original question text' },
          { name: 'query_type', type: 'STRING', mode: 'NULLABLE', description: 'Detected query type' },
          { name: 'sql_generated', type: 'STRING', mode: 'NULLABLE', description: 'Generated SQL queries (JSON)' },
          { name: 'response_time_ms', type: 'INTEGER', mode: 'NULLABLE', description: 'Response time in milliseconds' },
          { name: 'success', type: 'BOOLEAN', mode: 'REQUIRED', description: 'Whether query succeeded' },
          { name: 'error_message', type: 'STRING', mode: 'NULLABLE', description: 'Error if failed' },
          { name: 'timestamp', type: 'TIMESTAMP', mode: 'REQUIRED', description: 'When query was made' }
        ]
      },
      timePartitioning: {
        type: 'DAY',
        field: 'timestamp'
      },
      description: 'Tracks user natural language queries and system responses'
    };

    try {
      BigQuery.Tables.insert(table, projectId, datasetId);
      Logger.log(`Created table: ${tableId}`);
    } catch (error) {
      if (error.message.includes('Already Exists')) {
        Logger.log(`Table ${tableId} already exists`);
      } else {
        throw error;
      }
    }
  },

  /**
   * Create system_logs table for monitoring and debugging
   */
  createSystemLogsTable() {
    const tableId = 'system_logs';
    const datasetId = Config.BIGQUERY_DATASET;
    const projectId = Config.GCP_PROJECT_ID;

    const table = {
      tableReference: {
        projectId: projectId,
        datasetId: datasetId,
        tableId: tableId
      },
      schema: {
        fields: [
          { name: 'log_id', type: 'STRING', mode: 'REQUIRED', description: 'Unique log ID' },
          { name: 'level', type: 'STRING', mode: 'REQUIRED', description: 'Log level: DEBUG, INFO, WARN, ERROR' },
          { name: 'component', type: 'STRING', mode: 'REQUIRED', description: 'Component name' },
          { name: 'message', type: 'STRING', mode: 'REQUIRED', description: 'Log message' },
          { name: 'metadata', type: 'STRING', mode: 'NULLABLE', description: 'Additional metadata (JSON)' },
          { name: 'error_stack', type: 'STRING', mode: 'NULLABLE', description: 'Error stack trace' },
          { name: 'execution_id', type: 'STRING', mode: 'NULLABLE', description: 'Script execution ID' },
          { name: 'timestamp', type: 'TIMESTAMP', mode: 'REQUIRED', description: 'Log timestamp' }
        ]
      },
      timePartitioning: {
        type: 'DAY',
        field: 'timestamp'
      },
      clustering: {
        fields: ['level', 'component']
      },
      description: 'System logs for monitoring and debugging'
    };

    try {
      BigQuery.Tables.insert(table, projectId, datasetId);
      Logger.log(`Created table: ${tableId}`);
    } catch (error) {
      if (error.message.includes('Already Exists')) {
        Logger.log(`Table ${tableId} already exists`);
      } else {
        throw error;
      }
    }
  },

  /**
   * Create email_engagement table for tracking email interactions
   */
  createEmailEngagementTable() {
    const tableId = 'email_engagement';
    const datasetId = Config.BIGQUERY_DATASET;
    const projectId = Config.GCP_PROJECT_ID;

    const table = {
      tableReference: {
        projectId: projectId,
        datasetId: datasetId,
        tableId: tableId
      },
      schema: {
        fields: [
          { name: 'engagement_id', type: 'STRING', mode: 'REQUIRED', description: 'Unique engagement ID' },
          { name: 'email_id', type: 'STRING', mode: 'REQUIRED', description: 'Email campaign ID' },
          { name: 'email_type', type: 'STRING', mode: 'REQUIRED', description: 'Type: daily or weekly' },
          { name: 'recipient', type: 'STRING', mode: 'REQUIRED', description: 'Email recipient' },
          { name: 'sent_at', type: 'TIMESTAMP', mode: 'REQUIRED', description: 'When email was sent' },
          { name: 'opened', type: 'BOOLEAN', mode: 'NULLABLE', description: 'Whether email was opened' },
          { name: 'opened_at', type: 'TIMESTAMP', mode: 'NULLABLE', description: 'When email was opened' },
          { name: 'clicked', type: 'BOOLEAN', mode: 'NULLABLE', description: 'Whether links were clicked' },
          { name: 'clicked_at', type: 'TIMESTAMP', mode: 'NULLABLE', description: 'When links were clicked' },
          { name: 'question_asked', type: 'STRING', mode: 'NULLABLE', description: 'Question from AMP form' },
          { name: 'question_asked_at', type: 'TIMESTAMP', mode: 'NULLABLE', description: 'When question was asked' }
        ]
      },
      timePartitioning: {
        type: 'DAY',
        field: 'sent_at'
      },
      description: 'Tracks email engagement metrics'
    };

    try {
      BigQuery.Tables.insert(table, projectId, datasetId);
      Logger.log(`Created table: ${tableId}`);
    } catch (error) {
      if (error.message.includes('Already Exists')) {
        Logger.log(`Table ${tableId} already exists`);
      } else {
        throw error;
      }
    }
  },

  /**
   * Create views for common queries
   */
  createAnalyticsViews() {
    const queries = [
      {
        name: 'daily_accuracy_view',
        sql: `
          CREATE OR REPLACE VIEW \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.daily_accuracy_view\` AS
          SELECT
            DATE(target_date) as date,
            prediction_type,
            AVG(accuracy_percent) as avg_accuracy,
            COUNT(*) as prediction_count,
            AVG(confidence_score) as avg_confidence,
            STDDEV(accuracy_percent) as accuracy_stddev
          FROM \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.predictions_tracking\`
          WHERE actual_value IS NOT NULL
          GROUP BY date, prediction_type
          ORDER BY date DESC
        `
      },
      {
        name: 'weekly_performance_view',
        sql: `
          CREATE OR REPLACE VIEW \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.weekly_performance_view\` AS
          SELECT
            DATE_TRUNC(report_date, WEEK) as week,
            SUM(net_sales) as total_sales,
            COUNT(DISTINCT DATE(report_date)) as days_with_data,
            AVG(net_sales) as avg_daily_sales
          FROM \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.reports\` r
          JOIN \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.metrics\` m
          ON r.report_id = m.report_id
          GROUP BY week
          ORDER BY week DESC
        `
      }
    ];

    queries.forEach(view => {
      try {
        const request = {
          query: view.sql,
          useLegacySql: false
        };
        BigQuery.Jobs.insert(request, Config.GCP_PROJECT_ID);
        Logger.log(`Created view: ${view.name}`);
      } catch (error) {
        Logger.log(`Error creating view ${view.name}: ${error.toString()}`);
      }
    });
  },

  /**
   * Run initial setup for frontend tables
   */
  runSetup() {
    Logger.log('Running frontend schema setup...');

    const success = this.createAllTables();
    if (success) {
      this.createAnalyticsViews();
      Logger.log('Frontend schema setup completed successfully');

      // Show success message to user
      const ui = SpreadsheetApp.getUi();
      ui.alert('Setup Complete', 'Frontend analytics tables have been created successfully in BigQuery.', ui.ButtonSet.OK);
    } else {
      const ui = SpreadsheetApp.getUi();
      ui.alert('Setup Failed', 'There was an error creating the BigQuery tables. Check the logs for details.', ui.ButtonSet.OK);
    }

    return success;
  }
};