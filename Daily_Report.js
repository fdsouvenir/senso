/**
 * @OnlyCurrentDoc
 *
 * Daily Report Generator - Queries real data from BigQuery
 * Generates comparative analytics and predictions
 */

const DailyReport = {
  /**
   * Generate a complete daily report with real data
   * @param {Date} reportDate The date to generate report for (default: yesterday)
   * @returns {Object} Complete report data
   */
  async generate(reportDate = null) {
    try {
      // Default to yesterday if no date provided
      const targetDate = reportDate || this.getYesterday();
      const dayOfWeek = Utilities.formatDate(targetDate, Config.REPORTS.daily.timezone, 'EEEE');

      ErrorHandler.info('DailyReport', `Generating report for ${Config.formatDate(targetDate)}`);

      // Get all data in parallel for performance
      const [
        currentDayMetrics,
        previousWeekMetrics,
        multiWeekTrend,
        categoryBreakdown,
        prediction
      ] = await Promise.all([
        this.getDayMetrics(targetDate),
        this.getDayMetrics(this.getSameDayLastWeek(targetDate)),
        this.getMultiWeekTrend(targetDate),
        this.getCategoryBreakdown(targetDate),
        this.generatePrediction(this.getTomorrow(targetDate))
      ]);

      // Calculate comparison
      const percentChange = previousWeekMetrics.totalSales > 0
        ? ((currentDayMetrics.totalSales - previousWeekMetrics.totalSales) / previousWeekMetrics.totalSales * 100)
        : 0;

      // Generate trend chart URL
      const trendChartUrl = ChartGenerator.generateLineChart(
        multiWeekTrend.values,
        `${dayOfWeek} Sales Trend`,
        600, 300,
        null,
        multiWeekTrend.labels
      );

      return {
        date: Config.formatDate(targetDate),
        displayDate: Utilities.formatDate(targetDate, Config.REPORTS.daily.timezone, 'EEEE, MMMM d, yyyy'),
        dayName: dayOfWeek,
        totalSales: currentDayMetrics.totalSales,
        transactionCount: currentDayMetrics.transactionCount,
        percentChange: percentChange,
        previousWeekSales: previousWeekMetrics.totalSales,
        contextNote: this.generateContextNote(percentChange, dayOfWeek),
        categories: categoryBreakdown,
        trendChartUrl: trendChartUrl,
        multiWeekTrend: multiWeekTrend,
        prediction: prediction
      };
    } catch (error) {
      ErrorHandler.handleError(error, 'DailyReport.generate', { reportDate });
      throw error;
    }
  },

  /**
   * Get sales metrics for a specific day
   * @param {Date} date Target date
   * @returns {Object} Day metrics
   */
  getDayMetrics(date) {
    const dateStr = Config.formatDate(date);

    const query = `
      SELECT
        COUNT(DISTINCT r.report_id) as transaction_count,
        IFNULL(SUM(m.net_sales), 0) as total_sales,
        IFNULL(SUM(m.quantity_sold), 0) as total_items,
        IFNULL(AVG(m.net_sales), 0) as avg_item_price
      FROM \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.reports}\` r
      LEFT JOIN \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.metrics}\` m
        ON r.report_id = m.report_id
      WHERE DATE(r.report_date) = @targetDate
    `;

    const request = {
      query: query,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: [
        {
          name: 'targetDate',
          parameterType: { type: 'DATE' },
          parameterValue: { value: dateStr }
        }
      ]
    };

    try {
      const queryResults = BigQuery.Jobs.query(request, Config.GCP_PROJECT_ID);
      const rows = queryResults.rows || [];

      if (rows.length > 0) {
        const row = rows[0];
        return {
          totalSales: parseFloat(row.f[1].v || 0),
          transactionCount: parseInt(row.f[0].v || 0),
          totalItems: parseInt(row.f[2].v || 0),
          avgItemPrice: parseFloat(row.f[3].v || 0)
        };
      }

      return { totalSales: 0, transactionCount: 0, totalItems: 0, avgItemPrice: 0 };
    } catch (error) {
      ErrorHandler.handleError(error, 'DailyReport.getDayMetrics', { date: dateStr });
      return { totalSales: 0, transactionCount: 0, totalItems: 0, avgItemPrice: 0 };
    }
  },

  /**
   * Get category breakdown with top items
   * @param {Date} date Target date
   * @returns {Array} Categories with top items
   */
  getCategoryBreakdown(date) {
    const dateStr = Config.formatDate(date);

    const query = `
      WITH CategoryItems AS (
        SELECT
          m.category,
          m.item_name,
          SUM(m.net_sales) as total_sales,
          SUM(m.quantity_sold) as quantity,
          ROW_NUMBER() OVER (
            PARTITION BY m.category
            ORDER BY SUM(m.net_sales) DESC
          ) as rank
        FROM \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.metrics}\` m
        JOIN \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.reports}\` r
          ON m.report_id = r.report_id
        WHERE DATE(r.report_date) = @targetDate
          AND m.category IN UNNEST(@categories)
        GROUP BY m.category, m.item_name
      )
      SELECT
        category,
        item_name,
        total_sales,
        quantity
      FROM CategoryItems
      WHERE rank <= @topN
      ORDER BY category, rank
    `;

    const request = {
      query: query,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: [
        {
          name: 'targetDate',
          parameterType: { type: 'DATE' },
          parameterValue: { value: dateStr }
        },
        {
          name: 'categories',
          parameterType: { type: 'ARRAY', arrayType: { type: 'STRING' } },
          parameterValue: { arrayValues: Config.REPORTS.daily.categories.map(c => ({ value: c })) }
        },
        {
          name: 'topN',
          parameterType: { type: 'INT64' },
          parameterValue: { value: Config.REPORTS.daily.topItemsPerCategory }
        }
      ]
    };

    try {
      const queryResults = BigQuery.Jobs.query(request, Config.GCP_PROJECT_ID);
      const rows = queryResults.rows || [];

      // Group by category
      const categoryMap = {};

      rows.forEach(row => {
        const category = row.f[0].v;
        const item = {
          name: row.f[1].v,
          sales: parseFloat(row.f[2].v || 0),
          quantity: parseInt(row.f[3].v || 0)
        };

        if (!categoryMap[category]) {
          categoryMap[category] = {
            name: category,
            items: []
          };
        }

        categoryMap[category].items.push(item);
      });

      // Convert to array and ensure all configured categories are present
      return Config.REPORTS.daily.categories.map(categoryName => {
        return categoryMap[categoryName] || {
          name: categoryName,
          items: []
        };
      }).filter(cat => cat.items.length > 0);

    } catch (error) {
      ErrorHandler.handleError(error, 'DailyReport.getCategoryBreakdown', { date: dateStr });
      return [];
    }
  },

  /**
   * Get multi-week trend for the same day of week
   * @param {Date} date Target date
   * @returns {Object} Trend data with values and labels
   */
  getMultiWeekTrend(date) {
    const dayOfWeek = date.getDay();
    const weeks = Config.REPORTS.daily.trendWeeks;
    const dates = [];
    const currentDate = new Date(date);

    // Get dates for the same day of week over past weeks
    for (let i = weeks - 1; i >= 0; i--) {
      const trendDate = new Date(currentDate);
      trendDate.setDate(trendDate.getDate() - (i * 7));
      dates.push(Config.formatDate(trendDate));
    }

    const query = `
      SELECT
        DATE(r.report_date) as sale_date,
        IFNULL(SUM(m.net_sales), 0) as total_sales
      FROM \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.reports}\` r
      LEFT JOIN \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.metrics}\` m
        ON r.report_id = m.report_id
      WHERE DATE(r.report_date) IN UNNEST(@dates)
      GROUP BY sale_date
      ORDER BY sale_date
    `;

    const request = {
      query: query,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: [
        {
          name: 'dates',
          parameterType: { type: 'ARRAY', arrayType: { type: 'DATE' } },
          parameterValue: { arrayValues: dates.map(d => ({ value: d })) }
        }
      ]
    };

    try {
      const queryResults = BigQuery.Jobs.query(request, Config.GCP_PROJECT_ID);
      const rows = queryResults.rows || [];

      // Create a map for quick lookup
      const salesMap = {};
      rows.forEach(row => {
        salesMap[row.f[0].v] = parseFloat(row.f[1].v || 0);
      });

      // Build arrays with all dates (including zeros for missing data)
      const values = dates.map(d => salesMap[d] || 0);
      const labels = dates.map(d => {
        const dt = new Date(d);
        return Utilities.formatDate(dt, Config.REPORTS.daily.timezone, 'M/d');
      });

      return {
        values: values,
        labels: labels,
        dates: dates
      };

    } catch (error) {
      ErrorHandler.handleError(error, 'DailyReport.getMultiWeekTrend', { date });
      return { values: [], labels: [], dates: [] };
    }
  },

  /**
   * Generate prediction for a future date
   * @param {Date} targetDate Date to predict
   * @returns {Object} Prediction object
   */
  generatePrediction(targetDate) {
    const dateStr = Config.formatDate(targetDate);
    const dayOfWeek = Utilities.formatDate(targetDate, Config.REPORTS.daily.timezone, 'EEEE');

    // Get historical data for the same day of week
    const query = `
      WITH HistoricalData AS (
        SELECT
          DATE(r.report_date) as sale_date,
          EXTRACT(DAYOFWEEK FROM r.report_date) as day_of_week,
          SUM(m.net_sales) as total_sales
        FROM \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.reports}\` r
        JOIN \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.metrics}\` m
          ON r.report_id = m.report_id
        WHERE DATE(r.report_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
          AND EXTRACT(DAYOFWEEK FROM r.report_date) = @dayOfWeek
        GROUP BY sale_date, day_of_week
      )
      SELECT
        AVG(total_sales) as avg_sales,
        STDDEV(total_sales) as stddev_sales,
        COUNT(*) as sample_size,
        MAX(total_sales) as max_sales,
        MIN(total_sales) as min_sales
      FROM HistoricalData
    `;

    const request = {
      query: query,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: [
        {
          name: 'dayOfWeek',
          parameterType: { type: 'INT64' },
          parameterValue: { value: (targetDate.getDay() + 1).toString() } // BigQuery uses 1-7 for Sun-Sat
        }
      ]
    };

    try {
      const queryResults = BigQuery.Jobs.query(request, Config.GCP_PROJECT_ID);
      const rows = queryResults.rows || [];

      if (rows.length > 0) {
        const row = rows[0];
        const avgSales = parseFloat(row.f[0].v || 0);
        const stdDev = parseFloat(row.f[1].v || 0);
        const sampleSize = parseInt(row.f[2].v || 0);

        // Simple prediction based on average with some variance
        const predictedAmount = Math.round(avgSales);

        // Calculate confidence based on sample size and variance
        const confidence = Math.min(10, Math.max(1,
          Math.round(10 * (sampleSize / 20) * (1 - (stdDev / avgSales)))
        ));

        // Generate unique prediction ID
        const predictionId = `PRED-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Create reasoning
        const reasoning = `Based on ${sampleSize} ${dayOfWeek}s from the past 90 days, ` +
          `with average sales of $${avgSales.toFixed(2)} and ` +
          `typical variation of ±$${stdDev.toFixed(2)}`;

        // Store prediction for tracking
        this.storePrediction(predictionId, targetDate, predictedAmount, confidence, reasoning);

        return {
          id: predictionId,
          amount: predictedAmount,
          reasoning: reasoning,
          confidence: confidence,
          historicalAvg: avgSales,
          sampleSize: sampleSize
        };
      }

      // Fallback if no historical data
      return {
        id: 'PRED-NO-DATA',
        amount: 0,
        reasoning: 'Insufficient historical data for prediction',
        confidence: 1,
        historicalAvg: 0,
        sampleSize: 0
      };

    } catch (error) {
      ErrorHandler.handleError(error, 'DailyReport.generatePrediction', { targetDate: dateStr });
      return {
        id: 'PRED-ERROR',
        amount: 0,
        reasoning: 'Unable to generate prediction due to error',
        confidence: 0
      };
    }
  },

  /**
   * Store prediction for accuracy tracking
   */
  storePrediction(predictionId, targetDate, amount, confidence, reasoning) {
    try {
      const row = {
        prediction_id: predictionId,
        prediction_date: Config.formatDate(new Date()),
        target_date: Config.formatDate(targetDate),
        prediction_type: 'daily',
        predicted_value: amount,
        confidence_score: confidence,
        reasoning: reasoning,
        created_at: new Date().toISOString()
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
        Config.TABLES.predictions
      );
    } catch (error) {
      ErrorHandler.warn('DailyReport', 'Failed to store prediction', { error: error.toString() });
    }
  },

  /**
   * Generate context note based on performance
   */
  generateContextNote(percentChange, dayOfWeek) {
    if (Math.abs(percentChange) < 5) {
      return `Typical ${dayOfWeek} performance, consistent with recent weeks`;
    } else if (percentChange > 20) {
      return `Strong ${dayOfWeek} performance, significantly above recent average`;
    } else if (percentChange > 5) {
      return `Good ${dayOfWeek} performance, above recent average`;
    } else if (percentChange < -20) {
      return `Below typical ${dayOfWeek} performance, may need attention`;
    } else {
      return `Slightly below recent ${dayOfWeek} average`;
    }
  },

  // Date helper functions
  getYesterday() {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date;
  },

  getTomorrow(baseDate = null) {
    const date = baseDate ? new Date(baseDate) : new Date();
    date.setDate(date.getDate() + 1);
    return date;
  },

  getSameDayLastWeek(date) {
    const lastWeek = new Date(date);
    lastWeek.setDate(lastWeek.getDate() - 7);
    return lastWeek;
  }
};