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
  generate(reportDate = null) {
    try {
      // Default to yesterday if no date provided
      const targetDate = reportDate || this.getYesterday();
      const dayOfWeek = Utilities.formatDate(targetDate, Config.REPORTS.daily.timezone, 'EEEE');

      ErrorHandler.info('DailyReport', `Generating report for ${Config.formatDate(targetDate)}`);

      // Get all data (sequential since Apps Script doesn't support async/await)
      const currentDayMetrics = this.getDayMetrics(targetDate);
      const previousWeekMetrics = this.getDayMetrics(this.getSameDayLastWeek(targetDate));
      const multiWeekTrend = this.getMultiWeekTrend(targetDate);
      const categoryBreakdown = this.getCategoryBreakdown(targetDate);
      const prediction = this.generatePrediction(this.getTomorrow(targetDate));

      // Ensure we have valid data
      const totalSales = currentDayMetrics.totalSales || 0;
      const previousSales = previousWeekMetrics.totalSales || 0;

      // Calculate comparison
      const percentChange = previousSales > 0
        ? ((totalSales - previousSales) / previousSales * 100)
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
        totalSales: totalSales,
        transactionCount: currentDayMetrics.transactionCount || 0,
        percentChange: percentChange,
        previousWeekSales: previousSales,
        contextNote: this.generateContextNote(percentChange, dayOfWeek),
        categories: categoryBreakdown,
        trendChartUrl: trendChartUrl,
        multiWeekTrend: multiWeekTrend,
        prediction: prediction
      };
    } catch (error) {
      ErrorHandler.handleError(error, 'DailyReport.generate', { reportDate });
      // Return a safe default object
      return {
        date: Config.formatDate(reportDate || new Date()),
        displayDate: Utilities.formatDate(reportDate || new Date(), Config.REPORTS.daily.timezone, 'EEEE, MMMM d, yyyy'),
        dayName: 'Error',
        totalSales: 0,
        transactionCount: 0,
        percentChange: 0,
        previousWeekSales: 0,
        contextNote: 'Error generating report',
        categories: [],
        trendChartUrl: '',
        multiWeekTrend: { values: [], labels: [], dates: [] },
        prediction: {
          id: 'ERROR',
          amount: 0,
          reasoning: 'Error generating prediction',
          confidence: 0
        }
      };
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
      WITH SalesData AS (
        SELECT
          r.report_id,
          SUM(CASE WHEN m.metric_name = 'net_sales' THEN m.metric_value ELSE 0 END) as total_sales,
          SUM(CASE WHEN m.metric_name = 'quantity_sold' THEN m.metric_value ELSE 0 END) as total_items
        FROM \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.reports}\` r
        LEFT JOIN \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.metrics}\` m
          ON r.report_id = m.report_id
        WHERE DATE(r.report_date) = @targetDate
        GROUP BY r.report_id
      )
      SELECT
        COUNT(DISTINCT report_id) as transaction_count,
        IFNULL(SUM(total_sales), 0) as total_sales,
        IFNULL(SUM(total_items), 0) as total_items,
        CASE
          WHEN SUM(total_items) > 0 THEN SUM(total_sales) / SUM(total_items)
          ELSE 0
        END as avg_item_price
      FROM SalesData
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
      WITH ItemData AS (
        SELECT
          JSON_EXTRACT_SCALAR(m.dimensions, '$.category') as category,
          JSON_EXTRACT_SCALAR(m.dimensions, '$.item_name') as item_name,
          MAX(CASE WHEN m.metric_name = 'net_sales' THEN m.metric_value ELSE 0 END) as sales_value,
          MAX(CASE WHEN m.metric_name = 'quantity_sold' THEN m.metric_value ELSE 0 END) as quantity_value
        FROM \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.metrics}\` m
        JOIN \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.reports}\` r
          ON m.report_id = r.report_id
        WHERE DATE(r.report_date) = @targetDate
        GROUP BY category, item_name
      ),
      CategoryItems AS (
        SELECT
          category,
          item_name,
          SUM(sales_value) as total_sales,
          SUM(quantity_value) as quantity,
          ROW_NUMBER() OVER (
            PARTITION BY category
            ORDER BY SUM(sales_value) DESC
          ) as rank
        FROM ItemData
        WHERE category IN UNNEST(@categories)
        GROUP BY category, item_name
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
          parameterValue: { value: Config.REPORTS.daily.topItemsPerCategory.toString() }
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
        IFNULL(SUM(CASE WHEN m.metric_name = 'net_sales' THEN m.metric_value ELSE 0 END), 0) as total_sales
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
          SUM(CASE WHEN m.metric_name = 'net_sales' THEN m.metric_value ELSE 0 END) as total_sales
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

        // Check if we have valid data
        if (avgSales > 0 && sampleSize > 0) {
          // Simple prediction based on average with some variance
          const predictedAmount = Math.round(avgSales);

          // Calculate confidence based on sample size and variance
          // Lower confidence when standard deviation is high relative to average
          const varianceRatio = stdDev / avgSales;  // How much variation as % of average
          const sampleRatio = Math.min(sampleSize / 20, 1);  // More samples = more confident

          // High variance should significantly reduce confidence
          // If stdDev is 30% of average, confidence should be lower
          const confidenceRatio = Math.max(0.1, 1 - (varianceRatio * 1.5));
          const confidence = Math.min(10, Math.max(1,
            Math.round(10 * sampleRatio * confidenceRatio)
          ));

          // Generate shorter, more readable prediction ID
          const timestamp = new Date().getTime().toString(36).toUpperCase();
          const random = Math.random().toString(36).substr(2, 5).toUpperCase();
          const predictionId = `${timestamp}-${random}`;

          // Create reasoning with HTML entity for plus-minus symbol
          const variationPercent = ((stdDev / avgSales) * 100).toFixed(0);
          const reasoning = `Based on ${sampleSize} ${dayOfWeek}s from the past 90 days, ` +
            `with average sales of $${avgSales.toFixed(2)} and ` +
            `typical variation of &plusmn;$${stdDev.toFixed(2)} (${variationPercent}%)`;

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