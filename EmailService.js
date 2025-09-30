/**
 * @OnlyCurrentDoc
 *
 * Email Service for sending daily reports, weekly roll-ups, and custom reports
 * Includes support for AMP for Email interactive components
 */

const EmailService = {
  /**
   * Send an email with support for AMP, HTML, and text fallbacks
   * @param {Object} options Email options
   * @returns {boolean} Success status
   */
  sendEmail(options) {
    const {
      recipient = Session.getActiveUser().getEmail(),
      subject,
      htmlBody,
      ampBody = null,
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

      // Add AMP version if provided and supported
      if (ampBody && Config.AMP.enabled) {
        mailOptions.htmlBody = this.buildMultipartEmail(ampBody, htmlBody, textBody);
      }

      // Add attachments if any
      if (attachments.length > 0) {
        mailOptions.attachments = attachments;
      }

      // Send email
      MailApp.sendEmail(mailOptions);

      // Log engagement
      this.logEmailSent(recipient, subject, ampBody ? 'amp' : 'html');

      return true;
    } catch (error) {
      Logger.log(`Failed to send email: ${error.toString()}`);
      return false;
    }
  },

  /**
   * Build multipart email with AMP, HTML, and text versions
   * @param {string} ampHtml AMP HTML content
   * @param {string} htmlContent Regular HTML content
   * @param {string} textContent Plain text content
   * @returns {string} Multipart email content
   */
  buildMultipartEmail(ampHtml, htmlContent, textContent) {
    // For now, return HTML as Gmail AMP requires special setup
    // TODO: Implement proper AMP multipart MIME structure
    return htmlContent;
  },

  /**
   * Send daily report email
   * @param {Object} reportData Report data
   * @returns {boolean} Success status
   */
  sendDailyReport(reportData) {
    const subject = `Daily Report - ${reportData.date}`;
    const htmlBody = this.buildDailyReportHtml(reportData);
    const ampBody = Config.AMP.enabled ? this.buildDailyReportAmp(reportData) : null;

    return this.sendEmail({
      subject: subject,
      htmlBody: htmlBody,
      ampBody: ampBody
    });
  },

  /**
   * Send weekly roll-up email
   * @param {Object} reportData Report data
   * @returns {boolean} Success status
   */
  sendWeeklyReport(reportData) {
    const subject = `Weekly Roll-Up - Week of ${reportData.weekStartDate}`;
    const htmlBody = this.buildWeeklyReportHtml(reportData);
    const ampBody = Config.AMP.enabled ? this.buildWeeklyReportAmp(reportData) : null;

    return this.sendEmail({
      subject: subject,
      htmlBody: htmlBody,
      ampBody: ampBody
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
      <div class="date">${data.displayDate}</div>
    </div>

    <div class="content">
      <!-- Key Metrics -->
      <div class="metric-card">
        <div class="metric-value">$${(data.totalSales || 0).toLocaleString()}</div>
        <div class="metric-label">${data.dayName} Total Sales</div>
        <div class="comparison">
          ${changeSymbol} ${Math.abs(data.percentChange || 0).toFixed(1)}% vs last ${data.dayName}
        </div>
        ${data.contextNote ? `<div style="color: #666; margin-top: 10px; font-style: italic;">${data.contextNote}</div>` : ''}
      </div>

      <!-- Category Breakdown -->
      ${(data.categories || []).map(category => `
        <div class="category-section">
          <div class="category-title">${category.name}</div>
          <table class="item-table">
            ${(category.items || []).slice(0, 5).map((item, index) => `
              <tr>
                <td class="item-rank">${index + 1}</td>
                <td class="item-name">${item.name}</td>
                <td class="item-sales">$${(item.sales || 0).toLocaleString()}</td>
                <td class="item-quantity">${item.quantity || 0} sold</td>
              </tr>
            `).join('')}
          </table>
        </div>
      `).join('')}

      <!-- Trend Chart -->
      ${data.trendChartUrl ? `
        <div class="chart-section">
          <div class="chart-title">3-Week ${data.dayName} Trend</div>
          <img src="${data.trendChartUrl}" alt="Sales trend" style="max-width: 100%; height: auto;">
        </div>
      ` : ''}

      <!-- Prediction -->
      <div class="prediction-box">
        <div class="prediction-title">Tomorrow's Forecast</div>
        <div class="prediction-value">Prediction #${data.prediction.id}: $${(data.prediction.amount || 0).toLocaleString()}</div>
        <div class="prediction-reason">${data.prediction.reasoning}</div>
        <div class="confidence">Confidence: ${data.prediction.confidence || 0}/10</div>
      </div>

      <!-- Interactive Form (Fallback for non-AMP) -->
      <div class="form-section">
        <div class="form-title">Ask a Question About Your Data</div>
        <form action="${Config.AMP.webAppUrl || '#'}" method="POST">
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
   * Build AMP version of daily report
   * @param {Object} data Report data
   * @returns {string} AMP HTML content
   */
  buildDailyReportAmp(data) {
    // AMP implementation requires special headers and structure
    // This is a placeholder for future AMP implementation
    return `
<!-- AMP Email Version -->
<div>
  <form method="post"
        action-xhr="${Config.AMP.webAppUrl}/query">
    <fieldset>
      <label>
        <span>Ask about your data:</span>
        <textarea name="question"
                  required
                  placeholder="e.g., Compare beer vs wine sales this week"></textarea>
      </label>
      <input type="submit" value="Get Report">
    </fieldset>
    <div submit-success>
      <template type="amp-mustache">
        Report sent to your inbox!
      </template>
    </div>
    <div submit-error>
      <template type="amp-mustache">
        Error: Please try again later.
      </template>
    </div>
  </form>
</div>
    `;
  },

  /**
   * Build HTML for weekly report
   * @param {Object} data Report data
   * @returns {string} HTML content
   */
  buildWeeklyReportHtml(data) {
    // Extend daily report with weekly sections
    let html = this.buildDailyReportHtml(data.sundayData);

    // Add weekly special section
    const weeklySection = `
      <div style="border-top: 3px solid #4285F4; margin-top: 40px; padding-top: 30px;">
        <h2 style="color: #333; font-size: 24px;">📈 Weekly Business Review</h2>

        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <div style="font-size: 32px; font-weight: bold;">$${(data.weekTotal || 0).toLocaleString()}</div>
          <div style="font-size: 18px; margin-top: 10px;">${data.weekComparison || 0}% vs previous week</div>
        </div>

        <!-- Significant Changes -->
        <div style="margin: 30px 0;">
          <h3 style="font-size: 18px; color: #333;">🔍 Notable Trends This Week</h3>
          ${(data.significantChanges || []).map(change => `
            <div style="padding: 15px; background: #f8f9fa; border-left: 4px solid ${change.positive ? '#34A853' : '#EA4335'}; margin: 10px 0;">
              <strong>${change.item}</strong>: ${change.description}
            </div>
          `).join('')}
        </div>

        <!-- Weekly Prediction -->
        <div style="background: #fff3cd; padding: 20px; border-radius: 8px; border-left: 4px solid #FFA000;">
          <h3 style="color: #F57C00;">🔮 This Week's Projection</h3>
          <div style="font-size: 24px; font-weight: bold; color: #333;">Expected: $${(data.weeklyPrediction?.amount || 0).toLocaleString()}</div>
          <div style="color: #666; margin-top: 10px;">${data.weeklyPrediction?.reasoning || 'Generating projection...'}</div>
        </div>
      </div>
    `;

    // Insert weekly section before the footer
    html = html.replace('<div class="footer">', weeklySection + '<div class="footer">');
    return html;
  },

  /**
   * Build AMP version of weekly report
   * @param {Object} data Report data
   * @returns {string} AMP HTML content
   */
  buildWeeklyReportAmp(data) {
    // Reuse daily AMP template
    return this.buildDailyReportAmp(data);
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
    const subject = `Your Data Report: "${question.substring(0, 50)}${question.length > 50 ? '...' : ''}"`;

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
      <strong>You asked:</strong> ${question}
    </div>

    <div class="answer">
      ${response.summary}
    </div>

    ${response.charts ? response.charts.map(chart => `
      <div class="chart">
        <h3>${chart.title}</h3>
        <img src="${chart.url}" alt="${chart.title}" style="max-width: 100%;">
      </div>
    `).join('') : ''}

    ${response.data ? `
      <table class="data-table">
        <thead>
          <tr>
            ${Object.keys(response.data[0]).map(key => `<th>${key}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${response.data.slice(0, 10).map(row => `
            <tr>
              ${Object.values(row).map(val => `<td>${val}</td>`).join('')}
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