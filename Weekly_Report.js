/**
 * @OnlyCurrentDoc
 *
 * Weekly Report Generator - Creates comprehensive weekly roll-up reports
 * Runs every Monday morning with insights and trends from the past week
 */

const WeeklyReport = {
  /**
   * Generate complete weekly report
   * @param {Date} weekEndDate The Sunday to use as week end (default: last Sunday)
   * @returns {Object} Complete weekly report data
   */
  generate(weekEndDate = null) {
    try {
      // Validate input date
      if (weekEndDate !== null) {
        if (!(weekEndDate instanceof Date) || isNaN(weekEndDate.getTime())) {
          throw new Error('Invalid weekEndDate: must be a valid Date object');
        }
      }

      // Rate limiting check
      const rateLimitKey = 'weekly_report_' + Session.getActiveUser().getEmail();
      if (!SecurityUtils.checkRateLimit(rateLimitKey, 10, 3600)) {
        throw new Error('Weekly report rate limit exceeded. Please wait before generating another report.');
      }

      // Default to last Sunday if no date provided
      const sunday = weekEndDate || this.getLastSunday();
      const monday = this.getMondayOfWeek(sunday);

      ErrorHandler.info('WeeklyReport', `Generating weekly report for week ending ${Config.formatDate(sunday)}`);

      // Get Sunday's daily report as the base
      const sundayReport = DailyReport.generate(sunday);

      // Get week metrics
      const weekMetrics = this.getWeekMetrics(monday, sunday);
      const previousWeekMetrics = this.getPreviousWeekMetrics(monday);
      const categoryPerformance = this.getCategoryPerformance(monday, sunday);
      const significantChanges = this.findSignificantChanges(monday, sunday);
      const weeklyPrediction = this.generateWeeklyPrediction(this.getNextMonday(sunday));

      // Calculate week-over-week comparison
      const weekComparison = previousWeekMetrics.total > 0
        ? ((weekMetrics.total - previousWeekMetrics.total) / previousWeekMetrics.total * 100)
        : 0;

      // Prepare data for return
      const reportData = {
        weekStartDate: Config.formatDate(monday),
        weekEndDate: Config.formatDate(sunday),
        sundayData: sundayReport,
        weekTotal: weekMetrics.total,
        weekTransactions: weekMetrics.transactions,
        weekAvgDaily: weekMetrics.avgDaily,
        weekComparison: weekComparison.toFixed(1),
        previousWeekTotal: previousWeekMetrics.total,
        categoryPerformance: categoryPerformance,
        significantChanges: significantChanges,
        weeklyPrediction: weeklyPrediction,
        bestDay: weekMetrics.bestDay,
        worstDay: weekMetrics.worstDay
      };

      // Generate AI-powered insight
      try {
        const aiInsight = GeminiService.generateWeeklyInsight(reportData);
        if (aiInsight) {
          reportData.aiInsight = aiInsight;
          ErrorHandler.info('WeeklyReport', 'AI insight generated successfully');
        }
      } catch (error) {
        ErrorHandler.info('WeeklyReport', 'AI insight generation failed, using fallback');
      }

      return reportData;
    } catch (error) {
      ErrorHandler.handleError(error, 'WeeklyReport.generate', { weekEndDate });
      return this.getErrorReport(weekEndDate);
    }
  },

  /**
   * Get metrics for the entire week
   * @param {Date} monday Week start
   * @param {Date} sunday Week end
   * @returns {Object} Week metrics
   */
  getWeekMetrics(monday, sunday) {
    const mondayStr = Config.formatDate(monday);
    const sundayStr = Config.formatDate(sunday);

    const query = `
      WITH DailyTotals AS (
        SELECT
          DATE(r.report_date) as sale_date,
          FORMAT_DATE('%A', r.report_date) as day_name,
          SUM(CASE WHEN m.metric_name = 'net_sales' THEN m.metric_value ELSE 0 END) as daily_sales,
          COUNT(DISTINCT r.report_id) as transactions
        FROM \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.reports}\` r
        LEFT JOIN \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.metrics}\` m
          ON r.report_id = m.report_id
        WHERE DATE(r.report_date) BETWEEN @mondayDate AND @sundayDate
        GROUP BY sale_date, day_name
      )
      SELECT
        SUM(daily_sales) as total_sales,
        SUM(transactions) as total_transactions,
        AVG(daily_sales) as avg_daily_sales,
        MAX(daily_sales) as max_daily_sales,
        MIN(daily_sales) as min_daily_sales,
        ARRAY_AGG(
          STRUCT(day_name, daily_sales)
          ORDER BY daily_sales DESC
          LIMIT 1
        )[SAFE_OFFSET(0)].day_name as best_day,
        ARRAY_AGG(
          STRUCT(day_name, daily_sales)
          ORDER BY daily_sales ASC
          LIMIT 1
        )[SAFE_OFFSET(0)].day_name as worst_day
      FROM DailyTotals
    `;

    const request = {
      query: query,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: [
        {
          name: 'mondayDate',
          parameterType: { type: 'DATE' },
          parameterValue: { value: mondayStr }
        },
        {
          name: 'sundayDate',
          parameterType: { type: 'DATE' },
          parameterValue: { value: sundayStr }
        }
      ]
    };

    try {
      const queryResults = BigQuery.Jobs.query(request, Config.GCP_PROJECT_ID);
      const rows = queryResults.rows || [];

      if (rows.length > 0) {
        const row = rows[0];
        return {
          total: parseFloat(row.f[0].v || 0),
          transactions: parseInt(row.f[1].v || 0),
          avgDaily: parseFloat(row.f[2].v || 0),
          maxDaily: parseFloat(row.f[3].v || 0),
          minDaily: parseFloat(row.f[4].v || 0),
          bestDay: row.f[5].v || 'Unknown',
          worstDay: row.f[6].v || 'Unknown'
        };
      }

      return { total: 0, transactions: 0, avgDaily: 0 };
    } catch (error) {
      ErrorHandler.handleError(error, 'WeeklyReport.getWeekMetrics', { monday, sunday });
      return { total: 0, transactions: 0, avgDaily: 0 };
    }
  },

  /**
   * Get previous week metrics for comparison
   * @param {Date} monday Current week's Monday
   * @returns {Object} Previous week metrics
   */
  getPreviousWeekMetrics(monday) {
    const prevMonday = new Date(monday);
    prevMonday.setDate(prevMonday.getDate() - 7);
    const prevSunday = new Date(monday);
    prevSunday.setDate(prevSunday.getDate() - 1);

    return this.getWeekMetrics(prevMonday, prevSunday);
  },

  /**
   * Get category performance for the week
   * @param {Date} monday Week start
   * @param {Date} sunday Week end
   * @returns {Array} Category performance data
   */
  getCategoryPerformance(monday, sunday) {
    const mondayStr = Config.formatDate(monday);
    const sundayStr = Config.formatDate(sunday);

    const query = `
      WITH CurrentWeek AS (
        SELECT
          JSON_EXTRACT_SCALAR(m.dimensions, '$.category') as category,
          SUM(CASE WHEN m.metric_name = 'net_sales' THEN m.metric_value ELSE 0 END) as current_sales,
          SUM(CASE WHEN m.metric_name = 'quantity_sold' THEN m.metric_value ELSE 0 END) as current_quantity
        FROM \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.metrics}\` m
        JOIN \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.reports}\` r
          ON m.report_id = r.report_id
        WHERE DATE(r.report_date) BETWEEN @mondayDate AND @sundayDate
        GROUP BY category
      ),
      PreviousWeek AS (
        SELECT
          JSON_EXTRACT_SCALAR(m.dimensions, '$.category') as category,
          SUM(CASE WHEN m.metric_name = 'net_sales' THEN m.metric_value ELSE 0 END) as previous_sales
        FROM \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.metrics}\` m
        JOIN \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.reports}\` r
          ON m.report_id = r.report_id
        WHERE DATE(r.report_date) BETWEEN DATE_SUB(@mondayDate, INTERVAL 7 DAY)
          AND DATE_SUB(@sundayDate, INTERVAL 7 DAY)
        GROUP BY category
      )
      SELECT
        c.category,
        c.current_sales,
        c.current_quantity,
        IFNULL(p.previous_sales, 0) as previous_sales,
        CASE
          WHEN p.previous_sales > 0 THEN
            ((c.current_sales - p.previous_sales) / p.previous_sales * 100)
          ELSE 0
        END as change_percent
      FROM CurrentWeek c
      LEFT JOIN PreviousWeek p ON c.category = p.category
      WHERE c.category IN UNNEST(@categories)
      ORDER BY c.current_sales DESC
    `;

    const request = {
      query: query,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: [
        {
          name: 'mondayDate',
          parameterType: { type: 'DATE' },
          parameterValue: { value: mondayStr }
        },
        {
          name: 'sundayDate',
          parameterType: { type: 'DATE' },
          parameterValue: { value: sundayStr }
        },
        {
          name: 'categories',
          parameterType: { type: 'ARRAY', arrayType: { type: 'STRING' } },
          parameterValue: { arrayValues: Config.REPORTS.daily.categories.map(c => ({ value: c })) }
        }
      ]
    };

    try {
      const queryResults = BigQuery.Jobs.query(request, Config.GCP_PROJECT_ID);
      const rows = queryResults.rows || [];

      return rows.map(row => ({
        category: row.f[0].v,
        currentSales: parseFloat(row.f[1].v || 0),
        currentQuantity: parseInt(row.f[2].v || 0),
        previousSales: parseFloat(row.f[3].v || 0),
        changePercent: parseFloat(row.f[4].v || 0)
      }));
    } catch (error) {
      ErrorHandler.handleError(error, 'WeeklyReport.getCategoryPerformance', { monday, sunday });
      return [];
    }
  },

  /**
   * Find significant changes in the week
   * @param {Date} monday Week start
   * @param {Date} sunday Week end
   * @returns {Array} Significant changes
   */
  findSignificantChanges(monday, sunday) {
    const mondayStr = Config.formatDate(monday);
    const sundayStr = Config.formatDate(sunday);

    const query = `
      WITH ItemComparison AS (
        SELECT
          JSON_EXTRACT_SCALAR(m.dimensions, '$.item_name') as item_name,
          SUM(CASE
            WHEN DATE(r.report_date) BETWEEN @mondayDate AND @sundayDate
            THEN CASE WHEN m.metric_name = 'net_sales' THEN m.metric_value ELSE 0 END
            ELSE 0
          END) as current_sales,
          SUM(CASE
            WHEN DATE(r.report_date) BETWEEN DATE_SUB(@mondayDate, INTERVAL 7 DAY)
              AND DATE_SUB(@sundayDate, INTERVAL 7 DAY)
            THEN CASE WHEN m.metric_name = 'net_sales' THEN m.metric_value ELSE 0 END
            ELSE 0
          END) as previous_sales
        FROM \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.metrics}\` m
        JOIN \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.reports}\` r
          ON m.report_id = r.report_id
        WHERE DATE(r.report_date) BETWEEN DATE_SUB(@mondayDate, INTERVAL 7 DAY) AND @sundayDate
          AND JSON_EXTRACT_SCALAR(m.dimensions, '$.item_name') IS NOT NULL
        GROUP BY item_name
        HAVING current_sales > 100 OR previous_sales > 100
      ),
      SignificantChanges AS (
        SELECT
          item_name,
          current_sales,
          previous_sales,
          current_sales - previous_sales as absolute_change,
          CASE
            WHEN previous_sales > 0 THEN
              ((current_sales - previous_sales) / previous_sales * 100)
            ELSE 100
          END as percent_change
        FROM ItemComparison
        WHERE ABS(current_sales - previous_sales) > 50
      )
      SELECT
        item_name,
        current_sales,
        previous_sales,
        absolute_change,
        percent_change
      FROM SignificantChanges
      ORDER BY ABS(percent_change) DESC
      LIMIT 10
    `;

    const request = {
      query: query,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: [
        {
          name: 'mondayDate',
          parameterType: { type: 'DATE' },
          parameterValue: { value: mondayStr }
        },
        {
          name: 'sundayDate',
          parameterType: { type: 'DATE' },
          parameterValue: { value: sundayStr }
        }
      ]
    };

    try {
      const queryResults = BigQuery.Jobs.query(request, Config.GCP_PROJECT_ID);
      const rows = queryResults.rows || [];

      return rows.map(row => {
        const percentChange = parseFloat(row.f[4].v || 0);
        const absoluteChange = parseFloat(row.f[3].v || 0);
        const itemName = row.f[0].v;

        let description;
        if (absoluteChange > 0) {
          description = `Up ${Math.abs(percentChange).toFixed(0)}% (+$${absoluteChange.toFixed(2)})`;
        } else {
          description = `Down ${Math.abs(percentChange).toFixed(0)}% (-$${Math.abs(absoluteChange).toFixed(2)})`;
        }

        return {
          item: itemName,
          description: description,
          positive: absoluteChange > 0,
          percentChange: percentChange,
          absoluteChange: absoluteChange
        };
      });
    } catch (error) {
      ErrorHandler.handleError(error, 'WeeklyReport.findSignificantChanges', { monday, sunday });
      return [];
    }
  },

  /**
   * Generate weekly prediction
   * @param {Date} nextMonday Start of next week
   * @returns {Object} Weekly prediction
   */
  generateWeeklyPrediction(nextMonday) {
    // Get historical weekly averages
    const query = `
      WITH WeeklyTotals AS (
        SELECT
          DATE_TRUNC(DATE(r.report_date), WEEK(MONDAY)) as week_start,
          SUM(CASE WHEN m.metric_name = 'net_sales' THEN m.metric_value ELSE 0 END) as weekly_sales
        FROM \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.reports}\` r
        JOIN \`${Config.GCP_PROJECT_ID}.${Config.BIGQUERY_DATASET}.${Config.TABLES.metrics}\` m
          ON r.report_id = m.report_id
        WHERE DATE(r.report_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 WEEK)
        GROUP BY week_start
      )
      SELECT
        AVG(weekly_sales) as avg_weekly,
        STDDEV(weekly_sales) as stddev_weekly,
        COUNT(*) as weeks_count
      FROM WeeklyTotals
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
        const avgWeekly = parseFloat(row.f[0].v || 0);
        const stdDev = parseFloat(row.f[1].v || 0);
        const weeksCount = parseInt(row.f[2].v || 0);

        const predictedAmount = Math.round(avgWeekly);
        const variationPercent = avgWeekly > 0 ? ((stdDev / avgWeekly) * 100).toFixed(0) : 0;

        return {
          amount: predictedAmount,
          reasoning: `Based on ${weeksCount} weeks of data, expecting average weekly sales ` +
            `of $${avgWeekly.toFixed(2)} with typical variation of ${variationPercent}%`,
          confidence: Math.min(10, Math.round(weeksCount / 2))
        };
      }

      return {
        amount: 0,
        reasoning: 'Insufficient historical data for weekly prediction',
        confidence: 0
      };
    } catch (error) {
      ErrorHandler.handleError(error, 'WeeklyReport.generateWeeklyPrediction');
      return {
        amount: 0,
        reasoning: 'Unable to generate weekly prediction',
        confidence: 0
      };
    }
  },

  /**
   * Get error report structure
   * @param {Date} weekEndDate Week end date
   * @returns {Object} Error report structure
   */
  getErrorReport(weekEndDate) {
    const sunday = weekEndDate || new Date();
    const monday = this.getMondayOfWeek(sunday);

    return {
      weekStartDate: Config.formatDate(monday),
      weekEndDate: Config.formatDate(sunday),
      sundayData: DailyReport.generate(sunday),
      weekTotal: 0,
      weekTransactions: 0,
      weekAvgDaily: 0,
      weekComparison: 0,
      previousWeekTotal: 0,
      categoryPerformance: [],
      significantChanges: [],
      weeklyPrediction: {
        amount: 0,
        reasoning: 'Error generating prediction',
        confidence: 0
      },
      bestDay: 'Unknown',
      worstDay: 'Unknown'
    };
  },

  // Date helper functions
  getLastSunday() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysToSunday = dayOfWeek === 0 ? 7 : dayOfWeek;
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - daysToSunday);
    return sunday;
  },

  getMondayOfWeek(sunday) {
    const monday = new Date(sunday);
    monday.setDate(sunday.getDate() - 6);
    return monday;
  },

  getNextMonday(sunday) {
    const nextMonday = new Date(sunday);
    nextMonday.setDate(sunday.getDate() + 1);
    return nextMonday;
  },

  /**
   * Run weekly report (called by trigger)
   */
  runWeeklyReport(isTest = false) {
    try {
      // Validate input
      if (typeof isTest !== 'boolean') {
        throw new Error('Invalid isTest parameter - must be boolean');
      }

      const today = new Date();
      const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' });

      // Check if reports should run today (Monday)
      if (!isTest && dayOfWeek !== 'Monday') {
        Logger.log(`Weekly reports only run on Monday, today is ${dayOfWeek}`);
        return;
      }

      ErrorHandler.info('WeeklyReport', 'Starting weekly report generation');

      // Generate report
      const reportData = this.generate();

      // Send email
      const emailSent = EmailService.sendWeeklyReport(reportData);

      if (emailSent) {
        ErrorHandler.info('WeeklyReport', 'Weekly report sent successfully');
      } else {
        throw new Error('Failed to send weekly report email');
      }

      return reportData;
    } catch (error) {
      ErrorHandler.handleError(error, 'WeeklyReport.runWeeklyReport');
      throw error;
    }
  }
};