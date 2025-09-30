/**
 * @OnlyCurrentDoc
 * 
 * A specialized parser module for 'Product Mix' (pmix) PDF reports.
 * This version uses the Gemini API for intelligent, multi-modal parsing.
 */
const PmixParser = {
  /**
   * Parses the content of a pmix PDF file using the Gemini API.
   * @param {DriveApp.File} file The PDF file to parse.
   * @returns {object|null} A structured object with report and metrics data, or null if parsing fails.
   */
  parse: function(file) {
    // 1. Call the Gemini service to do the heavy lifting of PDF parsing.
    const extractedJson = GeminiService.extractDataFromPdf(file);

    // 2. Check if the extraction was successful or if the report had no data.
    if (!extractedJson || !extractedJson.reportData) {
      Logger.log(`Gemini could not extract valid data from file: ${file.getName()}`);
      return null;
    }
    
    // 3. Structure the extracted data into the format our BigQuery loader expects.
    const reportId = `${extractedJson.reportData.report_date}-${file.getId()}`;

    const reportData = {
      report_id: reportId,
      report_type: 'PRODUCT_MIX',
      report_date: extractedJson.reportData.report_date,
      location: extractedJson.reportData.location,
      created_at: file.getDateCreated().toISOString()
    };
    
    const metricsData = [];
    if (extractedJson.metricsData) {
      for (const item of extractedJson.metricsData) {
        const dimensions = {
          category: item.category,
          item_name: item.item_name
        };
        metricsData.push(this.createMetric(reportId, 'quantity_sold', item.quantity_sold, dimensions));
        metricsData.push(this.createMetric(reportId, 'net_sales', item.net_sales, dimensions));
        metricsData.push(this.createMetric(reportId, 'discounts', item.discounts, dimensions));
      }
    }
    
    return { reportData, metricsData };
  },

  /**
   * Helper function to create a single metric object.
   */
  createMetric: function(reportId, name, value, dimensions) {
    // Generate a unique ID for the metric to prevent duplicates
    const metricId = `${reportId}-${name}-${dimensions.item_name.replace(/[^a-zA-Z0-9]/g, '')}`;
    return {
      metric_id: metricId,
      report_id: reportId,
      metric_name: name,
      metric_value: value,
      dimensions: JSON.stringify(dimensions)
    };
  }
};