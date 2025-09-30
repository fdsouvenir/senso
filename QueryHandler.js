/**
 * @OnlyCurrentDoc
 *
 * Query Handler - Natural Language Q&A System
 * Processes user questions and generates custom reports
 */

const QueryHandler = {
  /**
   * Process a natural language query from a user
   * @param {string} question User's question
   * @param {string} userEmail Email of the user asking
   * @returns {Object} Query response with data and visualizations
   */
  processQuery(question, userEmail = null) {
    try {
      // Input validation
      if (!question || typeof question !== 'string') {
        throw new Error('Invalid question: must be a non-empty string');
      }

      // Sanitize input
      const sanitizedQuestion = SecurityUtils.escapeHtml(question);

      // Rate limiting
      const rateLimitKey = 'query_' + (userEmail || Session.getActiveUser().getEmail());
      if (!SecurityUtils.checkRateLimit(rateLimitKey, 20, 3600)) {
        throw new Error('Query rate limit exceeded. Please wait before submitting another question.');
      }

      ErrorHandler.info('QueryHandler', `Processing query: "${sanitizedQuestion.substring(0, 100)}..."`);

      // Analyze query intent
      const queryIntent = this.analyzeIntent(sanitizedQuestion);

      // Log the query
      this.logQuery(sanitizedQuestion, userEmail, queryIntent);

      // Process based on intent
      let response;
      switch (queryIntent.type) {
        case 'sales':
          response = this.handleSalesQuery(queryIntent);
          break;
        case 'comparison':
          response = this.handleComparisonQuery(queryIntent);
          break;
        case 'trend':
          response = this.handleTrendQuery(queryIntent);
          break;
        case 'category':
          response = this.handleCategoryQuery(queryIntent);
          break;
        case 'item':
          response = this.handleItemQuery(queryIntent);
          break;
        case 'prediction':
          response = this.handlePredictionQuery(queryIntent);
          break;
        case 'dateRange':
          response = this.handleDateRangeQuery(queryIntent);
          break;
        default:
          response = this.handleGeneralQuery(sanitizedQuestion);
      }

      // Add charts if applicable
      response.charts = this.generateCharts(response.data, queryIntent);

      // Send email response
      if (userEmail) {
        EmailService.sendQueryResponse(userEmail, sanitizedQuestion, response);
      }

      return response;
    } catch (error) {
      ErrorHandler.handleError(error, 'QueryHandler.processQuery', { question });
      return {
        success: false,
        error: error.toString(),
        summary: 'Unable to process your query. Please try rephrasing or contact support.'
      };
    }
  },

  /**
   * Analyze query intent using pattern matching
   * @param {string} question User's question
   * @returns {Object} Intent analysis
   */
  analyzeIntent(question) {
    const lowerQuestion = question.toLowerCase();

    // Sales queries
    if (lowerQuestion.includes('sales') || lowerQuestion.includes('revenue')) {
      const dateMatch = this.extractDateFromQuery(lowerQuestion);
      return {
        type: 'sales',
        dateRange: dateMatch,
        focus: this.extractFocus(lowerQuestion)
      };
    }

    // Comparison queries
    if (lowerQuestion.includes('compare') || lowerQuestion.includes('vs') || lowerQuestion.includes('versus')) {
      return {
        type: 'comparison',
        items: this.extractComparisonItems(lowerQuestion),
        dateRange: this.extractDateFromQuery(lowerQuestion)
      };
    }

    // Trend queries
    if (lowerQuestion.includes('trend') || lowerQuestion.includes('over time') || lowerQuestion.includes('history')) {
      return {
        type: 'trend',
        item: this.extractItemName(lowerQuestion),
        dateRange: this.extractDateFromQuery(lowerQuestion)
      };
    }

    // Category queries
    if (Config.REPORTS.daily.categories.some(cat => lowerQuestion.includes(cat.toLowerCase()))) {
      const category = Config.REPORTS.daily.categories.find(cat =>
        lowerQuestion.includes(cat.toLowerCase())
      );
      return {
        type: 'category',
        category: category,
        dateRange: this.extractDateFromQuery(lowerQuestion)
      };
    }

    // Item-specific queries
    const itemMatch = lowerQuestion.match(/(?:show|get|find|what).+?(?:for|about|of)\s+([^,\.\?]+)/i);
    if (itemMatch) {
      return {
        type: 'item',
        itemName: itemMatch[1].trim(),
        dateRange: this.extractDateFromQuery(lowerQuestion)
      };
    }

    // Prediction queries
    if (lowerQuestion.includes('predict') || lowerQuestion.includes('forecast') || lowerQuestion.includes('tomorrow')) {
      return {
        type: 'prediction',
        target: this.extractPredictionTarget(lowerQuestion)
      };
    }

    // Date range queries
    const dateRange = this.extractDateFromQuery(lowerQuestion);
    if (dateRange.startDate && dateRange.endDate) {
      return {
        type: 'dateRange',
        dateRange: dateRange
      };
    }

    // Default to general query
    return { type: 'general', raw: question };
  },

  /**
   * Handle sales-specific queries
   * @param {Object} intent Query intent
   * @returns {Object} Query response
   */
  handleSalesQuery(intent) {
    const { startDate, endDate } = this.getDateRange(intent.dateRange);

    const query = `
      SELECT
        DATE(r.report_date) as date,
        SUM(CASE WHEN m.metric_name = 'net_sales' THEN m.metric_value ELSE 0 END) as total_sales,
        COUNT(DISTINCT r.report_id) as transactions
      FROM \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.reports}\` r
      LEFT JOIN \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.metrics}\` m
        ON r.report_id = m.report_id
      WHERE DATE(r.report_date) BETWEEN @startDate AND @endDate
      GROUP BY date
      ORDER BY date DESC
    `;

    const request = {
      query: query,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: [
        {
          name: 'startDate',
          parameterType: { type: 'DATE' },
          parameterValue: { value: Config.formatDate(startDate) }
        },
        {
          name: 'endDate',
          parameterType: { type: 'DATE' },
          parameterValue: { value: Config.formatDate(endDate) }
        }
      ]
    };

    try {
      const queryResults = BigQuery.Jobs.query(request, Config.GCP_PROJECT_ID);
      const rows = queryResults.rows || [];

      const data = rows.map(row => ({
        date: row.f[0].v,
        sales: parseFloat(row.f[1].v || 0),
        transactions: parseInt(row.f[2].v || 0)
      }));

      const totalSales = data.reduce((sum, row) => sum + row.sales, 0);
      const avgDaily = data.length > 0 ? totalSales / data.length : 0;

      return {
        success: true,
        summary: `Total sales from ${Config.formatDate(startDate)} to ${Config.formatDate(endDate)}: ` +
                `$${totalSales.toFixed(2)} (Average: $${avgDaily.toFixed(2)}/day)`,
        data: data,
        metrics: {
          totalSales: totalSales,
          avgDaily: avgDaily,
          daysAnalyzed: data.length
        }
      };
    } catch (error) {
      ErrorHandler.handleError(error, 'QueryHandler.handleSalesQuery');
      throw error;
    }
  },

  /**
   * Handle comparison queries
   * @param {Object} intent Query intent
   * @returns {Object} Query response
   */
  handleComparisonQuery(intent) {
    const items = intent.items || [];
    if (items.length < 2) {
      return {
        success: false,
        summary: 'Please specify at least two items to compare.'
      };
    }

    const { startDate, endDate } = this.getDateRange(intent.dateRange);

    const query = `
      SELECT
        JSON_EXTRACT_SCALAR(m.dimensions, '$.item_name') as item_name,
        SUM(CASE WHEN m.metric_name = 'net_sales' THEN m.metric_value ELSE 0 END) as total_sales,
        SUM(CASE WHEN m.metric_name = 'quantity_sold' THEN m.metric_value ELSE 0 END) as quantity
      FROM \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.metrics}\` m
      JOIN \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.reports}\` r
        ON m.report_id = r.report_id
      WHERE DATE(r.report_date) BETWEEN @startDate AND @endDate
        AND LOWER(JSON_EXTRACT_SCALAR(m.dimensions, '$.item_name')) IN UNNEST(@items)
      GROUP BY item_name
      ORDER BY total_sales DESC
    `;

    const request = {
      query: query,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: [
        {
          name: 'startDate',
          parameterType: { type: 'DATE' },
          parameterValue: { value: Config.formatDate(startDate) }
        },
        {
          name: 'endDate',
          parameterType: { type: 'DATE' },
          parameterValue: { value: Config.formatDate(endDate) }
        },
        {
          name: 'items',
          parameterType: { type: 'ARRAY', arrayType: { type: 'STRING' } },
          parameterValue: { arrayValues: items.map(item => ({ value: item.toLowerCase() })) }
        }
      ]
    };

    try {
      const queryResults = BigQuery.Jobs.query(request, Config.GCP_PROJECT_ID);
      const rows = queryResults.rows || [];

      const data = rows.map(row => ({
        item: row.f[0].v,
        sales: parseFloat(row.f[1].v || 0),
        quantity: parseInt(row.f[2].v || 0)
      }));

      const winner = data.length > 0 ? data[0] : null;

      return {
        success: true,
        summary: winner
          ? `${winner.item} performed best with $${winner.sales.toFixed(2)} in sales`
          : 'No data found for the specified items',
        data: data,
        comparisonType: 'items'
      };
    } catch (error) {
      ErrorHandler.handleError(error, 'QueryHandler.handleComparisonQuery');
      throw error;
    }
  },

  /**
   * Handle trend queries
   * @param {Object} intent Query intent
   * @returns {Object} Query response
   */
  handleTrendQuery(intent) {
    const { startDate, endDate } = this.getDateRange(intent.dateRange);

    let whereClause = 'DATE(r.report_date) BETWEEN @startDate AND @endDate';
    const queryParameters = [
      {
        name: 'startDate',
        parameterType: { type: 'DATE' },
        parameterValue: { value: Config.formatDate(startDate) }
      },
      {
        name: 'endDate',
        parameterType: { type: 'DATE' },
        parameterValue: { value: Config.formatDate(endDate) }
      }
    ];

    // Add item filter if specified
    if (intent.item) {
      whereClause += ` AND LOWER(JSON_EXTRACT_SCALAR(m.dimensions, '$.item_name')) = @itemName`;
      queryParameters.push({
        name: 'itemName',
        parameterType: { type: 'STRING' },
        parameterValue: { value: intent.item.toLowerCase() }
      });
    }

    const query = `
      SELECT
        DATE(r.report_date) as date,
        SUM(CASE WHEN m.metric_name = 'net_sales' THEN m.metric_value ELSE 0 END) as sales
      FROM \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.reports}\` r
      LEFT JOIN \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.metrics}\` m
        ON r.report_id = m.report_id
      WHERE ${whereClause}
      GROUP BY date
      ORDER BY date
    `;

    const request = {
      query: query,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: queryParameters
    };

    try {
      const queryResults = BigQuery.Jobs.query(request, Config.GCP_PROJECT_ID);
      const rows = queryResults.rows || [];

      const data = rows.map(row => ({
        date: row.f[0].v,
        sales: parseFloat(row.f[1].v || 0)
      }));

      // Calculate trend
      const trend = this.calculateTrend(data);

      return {
        success: true,
        summary: `${intent.item || 'Sales'} trend from ${Config.formatDate(startDate)} to ${Config.formatDate(endDate)}: ` +
                `${trend.direction} (${trend.changePercent.toFixed(1)}% change)`,
        data: data,
        trend: trend
      };
    } catch (error) {
      ErrorHandler.handleError(error, 'QueryHandler.handleTrendQuery');
      throw error;
    }
  },

  /**
   * Handle category-specific queries
   * @param {Object} intent Query intent
   * @returns {Object} Query response
   */
  handleCategoryQuery(intent) {
    const { startDate, endDate } = this.getDateRange(intent.dateRange);

    const query = `
      SELECT
        JSON_EXTRACT_SCALAR(m.dimensions, '$.item_name') as item_name,
        SUM(CASE WHEN m.metric_name = 'net_sales' THEN m.metric_value ELSE 0 END) as sales,
        SUM(CASE WHEN m.metric_name = 'quantity_sold' THEN m.metric_value ELSE 0 END) as quantity
      FROM \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.metrics}\` m
      JOIN \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.reports}\` r
        ON m.report_id = r.report_id
      WHERE DATE(r.report_date) BETWEEN @startDate AND @endDate
        AND JSON_EXTRACT_SCALAR(m.dimensions, '$.category') = @category
      GROUP BY item_name
      ORDER BY sales DESC
      LIMIT 20
    `;

    const request = {
      query: query,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: [
        {
          name: 'startDate',
          parameterType: { type: 'DATE' },
          parameterValue: { value: Config.formatDate(startDate) }
        },
        {
          name: 'endDate',
          parameterType: { type: 'DATE' },
          parameterValue: { value: Config.formatDate(endDate) }
        },
        {
          name: 'category',
          parameterType: { type: 'STRING' },
          parameterValue: { value: intent.category }
        }
      ]
    };

    try {
      const queryResults = BigQuery.Jobs.query(request, Config.GCP_PROJECT_ID);
      const rows = queryResults.rows || [];

      const data = rows.map(row => ({
        item: row.f[0].v,
        sales: parseFloat(row.f[1].v || 0),
        quantity: parseInt(row.f[2].v || 0)
      }));

      const totalSales = data.reduce((sum, item) => sum + item.sales, 0);
      const topItem = data.length > 0 ? data[0] : null;

      return {
        success: true,
        summary: `${intent.category} performance: $${totalSales.toFixed(2)} total sales. ` +
                (topItem ? `Top item: ${topItem.item} ($${topItem.sales.toFixed(2)})` : ''),
        data: data,
        category: intent.category
      };
    } catch (error) {
      ErrorHandler.handleError(error, 'QueryHandler.handleCategoryQuery');
      throw error;
    }
  },

  /**
   * Handle item-specific queries
   * @param {Object} intent Query intent
   * @returns {Object} Query response
   */
  handleItemQuery(intent) {
    const { startDate, endDate } = this.getDateRange(intent.dateRange);

    const query = `
      SELECT
        DATE(r.report_date) as date,
        SUM(CASE WHEN m.metric_name = 'net_sales' THEN m.metric_value ELSE 0 END) as sales,
        SUM(CASE WHEN m.metric_name = 'quantity_sold' THEN m.metric_value ELSE 0 END) as quantity
      FROM \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.metrics}\` m
      JOIN \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.reports}\` r
        ON m.report_id = r.report_id
      WHERE DATE(r.report_date) BETWEEN @startDate AND @endDate
        AND LOWER(JSON_EXTRACT_SCALAR(m.dimensions, '$.item_name')) LIKE @itemPattern
      GROUP BY date
      ORDER BY date DESC
    `;

    const request = {
      query: query,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: [
        {
          name: 'startDate',
          parameterType: { type: 'DATE' },
          parameterValue: { value: Config.formatDate(startDate) }
        },
        {
          name: 'endDate',
          parameterType: { type: 'DATE' },
          parameterValue: { value: Config.formatDate(endDate) }
        },
        {
          name: 'itemPattern',
          parameterType: { type: 'STRING' },
          parameterValue: { value: `%${intent.itemName.toLowerCase()}%` }
        }
      ]
    };

    try {
      const queryResults = BigQuery.Jobs.query(request, Config.GCP_PROJECT_ID);
      const rows = queryResults.rows || [];

      const data = rows.map(row => ({
        date: row.f[0].v,
        sales: parseFloat(row.f[1].v || 0),
        quantity: parseInt(row.f[2].v || 0)
      }));

      const totalSales = data.reduce((sum, row) => sum + row.sales, 0);
      const totalQuantity = data.reduce((sum, row) => sum + row.quantity, 0);

      return {
        success: true,
        summary: `${intent.itemName}: $${totalSales.toFixed(2)} in sales (${totalQuantity} units sold)`,
        data: data,
        item: intent.itemName
      };
    } catch (error) {
      ErrorHandler.handleError(error, 'QueryHandler.handleItemQuery');
      throw error;
    }
  },

  /**
   * Handle prediction queries
   * @param {Object} intent Query intent
   * @returns {Object} Query response
   */
  handlePredictionQuery(intent) {
    const targetDate = intent.target === 'week'
      ? new Date(new Date().setDate(new Date().getDate() + 7))
      : new Date(new Date().setDate(new Date().getDate() + 1));

    const prediction = intent.target === 'week'
      ? WeeklyReport.generateWeeklyPrediction(targetDate)
      : DailyReport.generatePrediction(targetDate);

    return {
      success: true,
      summary: `Prediction for ${Config.formatDate(targetDate)}: $${prediction.amount.toFixed(2)}. ${prediction.reasoning}`,
      data: [{
        date: Config.formatDate(targetDate),
        predictedAmount: prediction.amount,
        confidence: prediction.confidence
      }],
      prediction: prediction
    };
  },

  /**
   * Handle general queries using Gemini
   * @param {string} question Original question
   * @returns {Object} Query response
   */
  handleGeneralQuery(question) {
    // For complex queries, use a simple aggregation
    const query = `
      SELECT
        COUNT(DISTINCT r.report_id) as total_reports,
        COUNT(DISTINCT DATE(r.report_date)) as days_with_data,
        SUM(CASE WHEN m.metric_name = 'net_sales' THEN m.metric_value ELSE 0 END) as total_sales,
        AVG(CASE WHEN m.metric_name = 'net_sales' THEN m.metric_value ELSE 0 END) as avg_sale
      FROM \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.reports}\` r
      LEFT JOIN \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.metrics}\` m
        ON r.report_id = m.report_id
      WHERE DATE(r.report_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    `;

    const request = {
      query: query,
      useLegacySql: false
    };

    try {
      const queryResults = BigQuery.Jobs.query(request, Config.GCP_PROJECT_ID);
      const rows = queryResults.rows || [];

      if (rows.length > 0) {
        const row = rows[0];
        return {
          success: true,
          summary: `In the last 30 days: ${row.f[1].v} days of data, ` +
                  `$${parseFloat(row.f[2].v || 0).toFixed(2)} total sales`,
          data: [{
            totalReports: parseInt(row.f[0].v || 0),
            daysWithData: parseInt(row.f[1].v || 0),
            totalSales: parseFloat(row.f[2].v || 0),
            avgSale: parseFloat(row.f[3].v || 0)
          }]
        };
      }

      return {
        success: false,
        summary: 'Unable to process your query. Please try rephrasing.',
        data: []
      };
    } catch (error) {
      ErrorHandler.handleError(error, 'QueryHandler.handleGeneralQuery');
      throw error;
    }
  },

  /**
   * Generate charts for query results
   * @param {Array} data Query data
   * @param {Object} intent Query intent
   * @returns {Array} Chart configurations
   */
  generateCharts(data, intent) {
    if (!data || data.length === 0) return [];

    const charts = [];

    // Time series chart
    if (data[0]?.date) {
      const values = data.map(d => d.sales || d.total_sales || 0);
      const labels = data.map(d => {
        const date = new Date(d.date);
        return Utilities.formatDate(date, Config.REPORTS.daily.timezone, 'M/d');
      });

      charts.push({
        title: intent.type === 'trend' ? 'Sales Trend' : 'Daily Sales',
        url: ChartGenerator.generateLineChart(values, 'Sales Over Time', 600, 300, null, labels)
      });
    }

    // Bar chart for comparisons
    if (intent.type === 'comparison' || intent.type === 'category') {
      const items = data.slice(0, 10);
      const values = items.map(d => d.sales || 0);
      const labels = items.map(d => d.item || d.item_name || 'Unknown');

      charts.push({
        title: 'Top Items by Sales',
        url: ChartGenerator.generateBarChart(values, 'Sales Comparison', 600, 400, null, labels)
      });
    }

    return charts;
  },

  /**
   * Extract date range from query
   * @param {string} question Query text
   * @returns {Object} Date range
   */
  extractDateFromQuery(question) {
    const today = new Date();
    const lowerQuestion = question.toLowerCase();

    // Yesterday
    if (lowerQuestion.includes('yesterday')) {
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      return { startDate: yesterday, endDate: yesterday };
    }

    // Today
    if (lowerQuestion.includes('today')) {
      return { startDate: today, endDate: today };
    }

    // Last week
    if (lowerQuestion.includes('last week')) {
      const endDate = new Date(today);
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 7);
      return { startDate, endDate };
    }

    // Last month
    if (lowerQuestion.includes('last month')) {
      const endDate = new Date(today);
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 30);
      return { startDate, endDate };
    }

    // Default to last 7 days
    const endDate = new Date(today);
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 7);
    return { startDate, endDate };
  },

  /**
   * Get date range with defaults
   * @param {Object} dateRange Date range object
   * @returns {Object} Start and end dates
   */
  getDateRange(dateRange) {
    if (dateRange && dateRange.startDate && dateRange.endDate) {
      return dateRange;
    }

    // Default to last 7 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);

    return { startDate, endDate };
  },

  /**
   * Extract comparison items from query
   * @param {string} question Query text
   * @returns {Array} Items to compare
   */
  extractComparisonItems(question) {
    // Look for "X vs Y" or "X versus Y" pattern
    const vsMatch = question.match(/(\w+)\s+(?:vs|versus)\s+(\w+)/i);
    if (vsMatch) {
      return [vsMatch[1], vsMatch[2]];
    }

    // Look for "compare X and Y" pattern
    const compareMatch = question.match(/compare\s+(\w+)\s+and\s+(\w+)/i);
    if (compareMatch) {
      return [compareMatch[1], compareMatch[2]];
    }

    return [];
  },

  /**
   * Extract item name from query
   * @param {string} question Query text
   * @returns {string} Item name
   */
  extractItemName(question) {
    const patterns = [
      /(?:trend|history|performance)\s+(?:for|of)\s+([^,\.\?]+)/i,
      /show\s+(?:me\s+)?([^,\.\?]+)\s+trend/i
    ];

    for (const pattern of patterns) {
      const match = question.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  },

  /**
   * Extract focus from query
   * @param {string} question Query text
   * @returns {string} Focus area
   */
  extractFocus(question) {
    const lowerQuestion = question.toLowerCase();

    if (lowerQuestion.includes('best')) return 'best';
    if (lowerQuestion.includes('worst')) return 'worst';
    if (lowerQuestion.includes('top')) return 'top';
    if (lowerQuestion.includes('bottom')) return 'bottom';

    return 'all';
  },

  /**
   * Extract prediction target
   * @param {string} question Query text
   * @returns {string} Prediction target
   */
  extractPredictionTarget(question) {
    const lowerQuestion = question.toLowerCase();

    if (lowerQuestion.includes('week') || lowerQuestion.includes('weekly')) {
      return 'week';
    }

    return 'day';
  },

  /**
   * Calculate trend from data points
   * @param {Array} data Data points with date and value
   * @returns {Object} Trend analysis
   */
  calculateTrend(data) {
    if (!data || data.length < 2) {
      return { direction: 'insufficient data', changePercent: 0 };
    }

    const firstValue = data[0].sales || 0;
    const lastValue = data[data.length - 1].sales || 0;
    const changePercent = firstValue > 0
      ? ((lastValue - firstValue) / firstValue * 100)
      : 0;

    let direction;
    if (changePercent > 5) direction = 'increasing';
    else if (changePercent < -5) direction = 'decreasing';
    else direction = 'stable';

    return { direction, changePercent, firstValue, lastValue };
  },

  /**
   * Log user query for analytics
   * @param {string} question User question
   * @param {string} userEmail User email
   * @param {Object} intent Query intent
   */
  logQuery(question, userEmail, intent) {
    try {
      const row = {
        query_id: Utilities.getUuid(),
        user_email: userEmail || Session.getActiveUser().getEmail(),
        query_text: question.substring(0, 1000),
        query_type: intent.type,
        query_intent: JSON.stringify(intent),
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
        Config.TABLES.userQueries
      );
    } catch (error) {
      ErrorHandler.warn('QueryHandler', 'Failed to log query', { error: error.toString() });
    }
  }
};