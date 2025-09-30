/**
 * @OnlyCurrentDoc
 *
 * Email Service for sending daily reports, weekly roll-ups, and custom reports
 */

const EmailService = {
  /**
   * Send an email
   * @param {Object} options Email options
   * @returns {boolean} Success status
   */
  sendEmail(options) {
    const {
      recipient = Session.getActiveUser().getEmail(),
      subject,
      htmlBody,
      textBody = null,
      attachments = [],
      replyTo = Config.EMAIL.REPLY_TO,
      name = Config.EMAIL.SENDER_NAME
    } = options;

    try {
      // Build email options
      const mailOptions = {
        to: recipient,
        subject: `${Config.EMAIL.SUBJECT_PREFIX} ${subject}`,
        htmlBody: htmlBody,
        name: name,
        replyTo: replyTo
      };

      // Add attachments if any
      if (attachments.length > 0) {
        mailOptions.attachments = attachments;
      }

      // Send email
      MailApp.sendEmail(mailOptions);

      // Log engagement
      this.logEmailSent(recipient, subject, 'html');

      return true;
    } catch (error) {
      Logger.log(`Failed to send email: ${error.toString()}`);
      return false;
    }
  },


  /**
   * Send daily report email
   * @param {Object} reportData Report data
   * @returns {boolean} Success status
   */
  sendDailyReport(reportData) {
    const subject = `Daily Report - ${SecurityUtils.escapeHtml(reportData.date)}`;
    const htmlBody = this.buildDailyReportHtml(reportData);

    return this.sendEmail({
      subject: subject,
      htmlBody: htmlBody
    });
  },

  /**
   * Send weekly roll-up email
   * @param {Object} reportData Report data
   * @returns {boolean} Success status
   */
  sendWeeklyReport(reportData) {
    const subject = `Weekly Roll-Up - Week of ${SecurityUtils.escapeHtml(reportData.weekStartDate)}`;
    const htmlBody = this.buildWeeklyReportHtml(reportData);

    return this.sendEmail({
      subject: subject,
      htmlBody: htmlBody
    });
  },

  /**
   * Build HTML for daily report
   * @param {Object} data Report data
   * @returns {string} HTML content
   */
  buildDailyReportHtml(data) {
    const changeColor = data.percentChange >= 0 ? '#34A853' : '#EA4335';
    const changeSymbol = data.percentChange >= 0 ? '↑' : '↓';

    // Escape HTML in all user data
    const esc = SecurityUtils.escapeHtml;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .date { opacity: 0.9; margin-top: 5px; }
    .content { padding: 20px; }
    .metric-card { background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid ${changeColor}; }
    .metric-value { font-size: 32px; font-weight: bold; color: ${changeColor}; }
    .metric-label { color: #666; margin-top: 5px; }
    .comparison { color: ${changeColor}; font-size: 18px; margin-top: 10px; }
    .category-section { margin: 30px 0; }
    .category-title { font-size: 18px; font-weight: bold; color: #333; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px; }
    .item-table { width: 100%; margin-top: 15px; border-collapse: collapse; }
    .item-table tr { border-bottom: 1px solid #e0e0e0; }
    .item-table td { padding: 10px 0; }
    .item-rank { color: #666; font-weight: bold; width: 30px; }
    .item-name { color: #333; }
    .item-sales { text-align: right; font-weight: bold; color: #333; }
    .item-quantity { text-align: right; color: #666; font-size: 14px; }
    .chart-section { margin: 30px 0; text-align: center; }
    .chart-title { font-size: 16px; color: #333; margin-bottom: 15px; }
    .prediction-box { background: #e3f2fd; border-radius: 8px; padding: 20px; margin: 30px 0; border-left: 4px solid #2196F3; }
    .prediction-title { font-size: 18px; font-weight: bold; color: #1976D2; }
    .prediction-value { font-size: 24px; font-weight: bold; color: #333; margin: 10px 0; }
    .prediction-reason { color: #666; line-height: 1.5; }
    .confidence { display: inline-block; background: white; padding: 5px 10px; border-radius: 4px; margin-top: 10px; }
    .form-section { background: #f5f5f5; padding: 20px; margin-top: 30px; border-radius: 8px; }
    .form-title { font-size: 16px; font-weight: bold; margin-bottom: 15px; }
    .text-input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
    .submit-btn { background: #4285F4; color: white; padding: 12px 24px; border: none; border-radius: 4px; font-size: 16px; cursor: pointer; margin-top: 10px; }
    .footer { background: #f5f5f5; padding: 20px; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Daily Sales Report</h1>
      <div class="date">${esc(data.displayDate)}</div>
    </div>

    <div class="content">
      <!-- Key Metrics -->
      <div class="metric-card">
        <div class="metric-value">$${(data.totalSales || 0).toLocaleString()}</div>
        <div class="metric-label">${esc(data.dayName)} Total Sales</div>
        <div class="comparison">
          ${changeSymbol} ${Math.abs(data.percentChange || 0).toFixed(1)}% vs last ${esc(data.dayName)}
        </div>
        ${data.contextNote ? `<div style="color: #666; margin-top: 10px; font-style: italic;">${esc(data.contextNote)}</div>` : ''}
      </div>

      <!-- Category Breakdown -->
      ${(data.categories || []).map(category => `
        <div class="category-section">
          <div class="category-title">${esc(category.name)}</div>
          <table class="item-table">
            ${(category.items || []).slice(0, 5).map((item, index) => `
              <tr>
                <td class="item-rank">${index + 1}</td>
                <td class="item-name">${esc(item.name)}</td>
                <td class="item-sales">$${(item.sales || 0).toLocaleString()}</td>
                <td class="item-quantity">${item.quantity || 0} sold</td>
              </tr>
            `).join('')}
          </table>
        </div>
      `).join('')}

      <!-- Trend Chart -->
      ${data.trendChartUrl && data.trendChartUrl.length > 0 ? `
        <div class="chart-section">
          <div class="chart-title">3-Week ${esc(data.dayName)} Trend</div>
          <img src="${esc(data.trendChartUrl)}" alt="Sales trend for past 3 ${esc(data.dayName)}s" style="max-width: 100%; height: auto; display: block; margin: 0 auto;">
        </div>
      ` : `
        <div class="chart-section">
          <div class="chart-title">3-Week ${esc(data.dayName)} Trend</div>
          <div style="padding: 20px; background: #f8f9fa; color: #666; text-align: center;">
            Chart data not available
          </div>
        </div>
      `}

      <!-- Prediction -->
      <div class="prediction-box">
        <div class="prediction-title">Tomorrow's Forecast</div>
        <div class="prediction-value"><strong>$${(data.prediction.amount || 0).toLocaleString()}</strong></div>
        <div class="prediction-reason">${esc(data.prediction.reasoning)}</div>
        <div class="confidence">
          Confidence: ${data.prediction.confidence || 0}/10
          ${data.prediction.confidence <= 3 ? ' (Low - high variance in historical data)' :
            data.prediction.confidence <= 6 ? ' (Moderate)' :
            ' (High - consistent historical pattern)'}
        </div>
      </div>

      <!-- Interactive Form -->
      <div class="form-section">
        <div class="form-title">Ask a Question About Your Data</div>
        <form action="${Config.WEB_APP.url || '#'}" method="POST">
          <input type="text" class="text-input" name="question" placeholder="e.g., Show me wine sales from last week" required>
          <button type="submit" class="submit-btn">Get Report</button>
        </form>
      </div>
    </div>

    <div class="footer">
      <p>Senso Analytics | Powered by AI</p>
      <p>Reply to this email with questions or feedback</p>
    </div>
  </div>
</body>
</html>
    `;
  },


  /**
   * Build HTML for weekly report
   * @param {Object} data Report data
   * @returns {string} HTML content
   */
  buildWeeklyReportHtml(data) {
    // Escape HTML in all user data
    const esc = SecurityUtils.escapeHtml;

    // Format dates with ordinals
    const formatDateWithOrdinal = (dateStr) => {
      const date = new Date(dateStr);
      const day = date.getDate();
      const suffix = ['th', 'st', 'nd', 'rd'][day % 10 > 3 ? 0 : (day % 100 - day % 10 !== 10) * day % 10];
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      return `${monthNames[date.getMonth()]} ${day}${suffix}`;
    };

    // Calculate key metrics
    const weekChange = parseFloat(data.weekComparison || 0);
    const weekChangeColor = weekChange >= 0 ? '#16a34a' : '#dc2626';
    const weekChangeSymbol = weekChange >= 0 ? '↑' : '↓';

    // Generate AI-powered insight if available, fallback to improved logic
    const keyInsight = data.aiInsight || (() => {
      if (data.significantChanges && data.significantChanges.length > 0) {
        const topChange = data.significantChanges[0];
        if (weekChange > 20) {
          return `Exceptional performance with ${weekChange.toFixed(0)}% growth vs last week. ${topChange.item} led with ${topChange.description}.`;
        } else if (weekChange > 0) {
          return `Solid week with ${weekChange.toFixed(0)}% growth vs last week. ${topChange.item} showed strong performance.`;
        } else if (weekChange > -10) {
          return `Down ${Math.abs(weekChange).toFixed(0)}% vs last week. Focus on ${topChange.item}: ${topChange.description}.`;
        } else {
          return `Significant decline of ${Math.abs(weekChange).toFixed(0)}% vs last week. Immediate attention needed for ${topChange.item}.`;
        }
      }
      // Fallback to basic insight
      return weekChange > 0 ?
        `Sales up ${weekChange.toFixed(0)}% compared to last week.` :
        `Sales down ${Math.abs(weekChange).toFixed(0)}% compared to last week.`;
    })();

    // Build executive-focused weekly report
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f9fafb; }
    .container { max-width: 600px; margin: 0 auto; background: white; }

    /* Executive Summary */
    .executive-summary { background: #1e3a5f; color: white; padding: 24px; }
    .week-header { text-align: center; margin-bottom: 20px; }
    .week-dates { font-size: 22px; font-weight: bold; margin-bottom: 4px; }
    .week-label { font-size: 12px; opacity: 0.8; text-transform: uppercase; }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
    .metric-block { text-align: center; }
    .metric-label { font-size: 11px; text-transform: uppercase; opacity: 0.8; margin-bottom: 4px; }
    .metric-value { font-size: 28px; font-weight: bold; line-height: 1; }
    .metric-change { font-size: 13px; margin-top: 4px; }
    .metric-comparison { font-size: 11px; opacity: 0.7; }
    .positive { color: #4ade80; }
    .negative { color: #f87171; }
    .neutral { color: #fbbf24; }

    /* Key Insight */
    .key-insight { background: #f0f9ff; border-left: 4px solid #0891b2; padding: 16px; margin: 20px; }
    .insight-title { font-size: 12px; text-transform: uppercase; color: #0891b2; margin-bottom: 4px; }
    .insight-text { font-size: 16px; color: #1e40af; line-height: 1.4; }

    /* Content sections */
    .content { padding: 20px; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 14px; font-weight: 600; color: #374151; text-transform: uppercase; margin-bottom: 12px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }

    /* Data tables */
    .data-table { width: 100%; }
    .data-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
    .data-label { color: #374151; flex: 1; padding-right: 10px; }
    .data-value-group { display: flex; align-items: center; gap: 8px; }
    .data-value { color: #111827; font-weight: 600; text-align: right; }
    .data-change { font-size: 13px; color: #6b7280; }

    /* Charts */
    .chart-container { background: #f9fafb; padding: 16px; border-radius: 8px; margin: 16px 0; text-align: center; }
    .chart-title { font-size: 12px; color: #6b7280; margin-bottom: 8px; }

    /* Forecast */
    .forecast-box { background: #fef3c7; border-radius: 8px; padding: 16px; margin: 20px; }
    .forecast-label { font-size: 12px; color: #92400e; text-transform: uppercase; margin-bottom: 4px; }
    .forecast-value { font-size: 24px; font-weight: bold; color: #451a03; }
    .forecast-detail { font-size: 13px; color: #78350f; margin-top: 4px; }

    /* Form section */
    .form-section { background: #f5f5f5; padding: 20px; margin: 20px; border-radius: 8px; }
    .form-title { font-size: 16px; font-weight: bold; margin-bottom: 15px; color: #333; }
    .text-input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box; }
    .submit-btn { background: #4285F4; color: white; padding: 12px 24px; border: none; border-radius: 4px; font-size: 16px; cursor: pointer; margin-top: 10px; width: 100%; }
    .submit-btn:hover { background: #3574e2; }

    /* Footer */
    .footer { background: #f9fafb; padding: 16px; text-align: center; color: #6b7280; font-size: 11px; border-top: 1px solid #e5e7eb; }

    /* Mobile responsiveness */
    @media (max-width: 480px) {
      .summary-grid { grid-template-columns: 1fr; gap: 16px; }
      .metric-value { font-size: 24px; }
      .week-dates { font-size: 18px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Executive Summary -->
    <div class="executive-summary">
      <div class="week-header">
        <div class="week-dates">Week of ${formatDateWithOrdinal(data.weekStartDate)} to ${formatDateWithOrdinal(data.weekEndDate)}</div>
        <div class="week-label">Weekly Performance Summary</div>
      </div>
      <div class="summary-grid">
        <div class="metric-block">
          <div class="metric-label">Total Sales</div>
          <div class="metric-value">$${(data.weekTotal || 0).toLocaleString()}</div>
          <div class="metric-change ${weekChange >= 0 ? 'positive' : 'negative'}">
            ${weekChangeSymbol} ${Math.abs(weekChange).toFixed(0)}%
          </div>
          <div class="metric-comparison">vs last week</div>
        </div>
        <div class="metric-block">
          <div class="metric-label">Daily Average</div>
          <div class="metric-value">$${((data.weekTotal || 0) / 7).toFixed(0).toLocaleString()}</div>
          <div class="metric-change neutral">7-day avg</div>
          <div class="metric-comparison">&nbsp;</div>
        </div>
        <div class="metric-block">
          <div class="metric-label">Best Day</div>
          <div class="metric-value">${esc(data.bestDay || 'N/A')}</div>
          <div class="metric-change neutral">${data.sundayData?.totalSales ? '$' + data.sundayData.totalSales.toLocaleString() : ''}</div>
          <div class="metric-comparison">&nbsp;</div>
        </div>
      </div>
    </div>

    <!-- Key Insight -->
    <div class="key-insight">
      <div class="insight-title">Key Insight</div>
      <div class="insight-text">
        ${esc(keyInsight)}
      </div>
    </div>

    <div class="content">
      <!-- Category Performance -->
      <div class="section">
        <div class="section-title">Category Performance</div>
        ${(data.categoryPerformance || []).slice(0, 10).map(cat => `
          <div class="data-row">
            <span class="data-label">${esc(cat.category)}</span>
            <div class="data-value-group">
              <span class="data-value">$${(cat.currentSales || 0).toFixed(0).toLocaleString()}</span>
              <span class="data-change ${cat.changePercent >= 0 ? 'positive' : 'negative'}">
                ${cat.changePercent >= 0 ? '↑' : '↓'} ${Math.abs(cat.changePercent).toFixed(0)}% vs last week
              </span>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Significant Changes -->
      ${data.significantChanges && data.significantChanges.length > 0 ? `
        <div class="section">
          <div class="section-title">Notable Changes This Week</div>
          ${data.significantChanges.slice(0, 10).map(change => `
            <div class="data-row">
              <span class="data-label">${esc(change.item)}</span>
              <span class="data-value ${change.positive ? 'positive' : 'negative'}">
                ${esc(change.description)}
              </span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <!-- Sunday Performance -->
      <div class="section">
        <div class="section-title">Yesterday's Performance (${esc(data.sundayData?.dayName || 'Sunday')})</div>
        <div class="data-row">
          <span class="data-label">Total Sales</span>
          <div class="data-value-group">
            <span class="data-value">$${(data.sundayData?.totalSales || 0).toLocaleString()}</span>
            <span class="data-change ${data.sundayData?.percentChange >= 0 ? 'positive' : 'negative'}">
              ${data.sundayData?.percentChange >= 0 ? '↑' : '↓'} ${Math.abs(data.sundayData?.percentChange || 0).toFixed(1)}% vs last ${esc(data.sundayData?.dayName || 'Sunday')}
            </span>
          </div>
        </div>
        ${data.sundayData?.categories ? `
          <div style="margin-top: 12px;">
            <div style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">Top Items Yesterday:</div>
            ${(data.sundayData.categories || []).slice(0, 3).map(cat =>
              (cat.items || []).slice(0, 2).map(item => `
                <div style="padding: 4px 0; font-size: 13px; color: #4b5563;">
                  • ${esc(item.name)}: $${(item.sales || 0).toLocaleString()}
                </div>
              `).join('')
            ).join('')}
          </div>
        ` : ''}
      </div>

      <!-- Week Trend Chart -->
      ${data.sundayData?.trendChartUrl ? `
        <div class="chart-container">
          <div class="chart-title">3-Week ${esc(data.sundayData?.dayName || 'Sunday')} Trend</div>
          <img src="${esc(data.sundayData.trendChartUrl)}" alt="Weekly trend" style="max-width: 100%; height: auto;">
        </div>
      ` : ''}
    </div>

    <!-- Forecast -->
    <div class="forecast-box">
      <div class="forecast-label">This Week's Projection</div>
      <div class="forecast-value">$${(data.weeklyPrediction?.amount || 0).toLocaleString()}</div>
      <div class="forecast-detail">
        ${data.weeklyPrediction?.confidence >= 7 ? 'High confidence based on consistent historical patterns' :
          data.weeklyPrediction?.confidence >= 4 ? 'Moderate confidence - some variability in historical data' :
          'Low confidence - significant variance in historical patterns'}
      </div>
    </div>

    <!-- Interactive Form -->
    <div class="form-section">
      <div class="form-title">Ask a Question About Your Data</div>
      <form action="${Config.WEB_APP.url || '#'}" method="POST">
        <input type="text" class="text-input" name="question" placeholder="e.g., Compare wine sales vs cocktail sales for last month" required>
        <input type="hidden" name="email" value="${Session.getActiveUser().getEmail()}">
        <input type="hidden" name="source" value="weekly_report">
        <button type="submit" class="submit-btn">Get Custom Report</button>
      </form>
    </div>

    <div class="footer">
      <p>Senso Analytics - Weekly Executive Summary</p>
      <p>Reply to this email with questions or feedback</p>
    </div>
  </div>
</body>
</html>
    `;

    return html;
  },


  /**
   * Log email sent for engagement tracking
   * @param {string} recipient Email recipient
   * @param {string} subject Email subject
   * @param {string} type Email type (amp/html)
   */
  logEmailSent(recipient, subject, type) {
    try {
      const engagementId = Utilities.getUuid();
      const emailId = `${type}-${new Date().getTime()}`;

      const row = {
        engagement_id: engagementId,
        email_id: emailId,
        email_type: subject.includes('Weekly') ? 'weekly' : 'daily',
        recipient: recipient,
        sent_at: new Date().toISOString(),
        opened: false,
        clicked: false
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
        'email_engagement'
      );
    } catch (error) {
      Logger.log(`Failed to log email engagement: ${error.toString()}`);
    }
  },

  /**
   * Send custom query response email
   * @param {string} recipient Email recipient
   * @param {string} question Original question
   * @param {Object} response Query response with charts and data
   * @returns {boolean} Success status
   */
  sendQueryResponse(recipient, question, response) {
    const subject = `Your Data Report: "${SecurityUtils.escapeHtml(question.substring(0, 50))}${question.length > 50 ? '...' : ''}"`;

    // Escape HTML in all user data
    const esc = SecurityUtils.escapeHtml;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; }
    .header { background: #4285F4; color: white; padding: 20px; margin: -20px -20px 20px -20px; }
    .question { background: #f8f9fa; padding: 15px; border-left: 4px solid #4285F4; margin: 20px 0; }
    .answer { margin: 20px 0; line-height: 1.6; }
    .chart { text-align: center; margin: 20px 0; }
    .data-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .data-table th { background: #f8f9fa; padding: 10px; text-align: left; }
    .data-table td { padding: 10px; border-bottom: 1px solid #e0e0e0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>📊 Your Custom Report</h2>
    </div>

    <div class="question">
      <strong>You asked:</strong> ${esc(question)}
    </div>

    <div class="answer">
      ${esc(response.summary)}
    </div>

    ${response.charts ? response.charts.map(chart => `
      <div class="chart">
        <h3>${esc(chart.title)}</h3>
        <img src="${esc(chart.url)}" alt="${esc(chart.title)}" style="max-width: 100%;">
      </div>
    `).join('') : ''}

    ${response.data ? `
      <table class="data-table">
        <thead>
          <tr>
            ${Object.keys(response.data[0]).map(key => `<th>${esc(key)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${response.data.slice(0, 10).map(row => `
            <tr>
              ${Object.values(row).map(val => `<td>${esc(String(val))}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''}

    <div style="margin-top: 30px; padding: 20px; background: #f5f5f5; text-align: center;">
      <p>Have another question? Reply to this email or use the form in your daily report.</p>
    </div>
  </div>
</body>
</html>
    `;

    return this.sendEmail({
      recipient: recipient,
      subject: subject,
      htmlBody: htmlBody
    });
  }
};