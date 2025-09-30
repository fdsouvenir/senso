/**
 * @OnlyCurrentDoc
 * 
 * Handles loading structured data into Google BigQuery.
 * Includes a retry mechanism to handle transient server errors.
 */
const BigQueryLoader = {
  /**
   * Loads report and metrics data into their respective BigQuery tables.
   * @param {object} data The structured data object from the parser.
   * @param {string} projectId The Google Cloud Project ID.
   */
  loadData: function(data, projectId) {
    const datasetId = 'restaurant_analytics';
    
    if (!data || !data.reportData || !data.metricsData || data.metricsData.length === 0) {
      Logger.log('Loader received empty or invalid data. Skipping.');
      return;
    }

    // --- Load Report Header Data with Retry Logic---
    try {
      const reportRow = { json: data.reportData };
      const reportRequest = { rows: [reportRow] };
      
      this.insertWithRetry(reportRequest, projectId, datasetId, 'reports');
      
      Logger.log(`Successfully loaded 1 row into 'reports' table for ID: ${data.reportData.report_id}`);
    } catch (e) {
      Logger.log(`Error loading data into 'reports' table after multiple retries: ${e.toString()}`);
      // If we can't load the parent report, don't load the metrics
      return;
    }
    
    // --- Load Metrics Data with Retry Logic---
    try {
      const metricRows = data.metricsData.map(metric => ({ json: metric }));
      const metricRequest = { rows: metricRows };

      this.insertWithRetry(metricRequest, projectId, datasetId, 'metrics');

      Logger.log(`Successfully loaded ${metricRows.length} rows into 'metrics' table for report ID: ${data.reportData.report_id}`);
    } catch (e) {
      Logger.log(`Error loading data into 'metrics' table after multiple retries: ${e.toString()}`);
    }
  },

  /**
   * A wrapper function that attempts to insert data into BigQuery,
   * retrying with exponential backoff if a transient server error occurs.
   * @param {object} request The BigQuery insertAll request object.
   * @param {string} projectId The GCP Project ID.
   * @param {string} datasetId The BigQuery Dataset ID.
   * @param {string} tableId The BigQuery Table ID.
   */
  insertWithRetry: function(request, projectId, datasetId, tableId) {
    const maxRetries = 4;
    let delay = 1000; // Start with a 1-second delay

    for (let i = 0; i < maxRetries; i++) {
      try {
        BigQuery.Tabledata.insertAll(request, projectId, datasetId, tableId);
        // If the call succeeds, exit the loop.
        return; 
      } catch (e) {
        // Check if the error is the specific transient error we want to retry.
        if (e.message.includes('We\'re sorry, a server error occurred')) {
          Logger.log(`Transient error caught on attempt ${i + 1}. Retrying in ${delay / 1000}s...`);
          Utilities.sleep(delay);
          delay *= 2; // Double the delay for the next retry (exponential backoff).
        } else {
          // If it's a different error (e.g., a data format issue), throw it immediately.
          throw e; 
        }
      }
    }
    
    // If the loop completes without a successful insert, throw a final error.
    throw new Error(`Failed to insert data into ${tableId} after ${maxRetries} attempts.`);
  },

  /**
   * Runs a query against BigQuery and returns the results.
   * @param {string} query The SQL query to execute.
   * @param {string} projectId The Google Cloud Project ID.
   * @returns {Array<Array<any>>|null} A 2D array of the results, with headers in the first row.
   */
  runQuery: function(query, projectId) {
    const request = {
      query: query,
      useLegacySql: false
    };
    let queryResults;
    try {
      queryResults = BigQuery.Jobs.query(request, projectId);
    } catch (e) {
      Logger.log(`BigQuery query failed: ${e.toString()} \nQuery: ${query}`);
      return null;
    }
    
    const jobId = queryResults.jobReference.jobId;

    // Wait for the query to complete.
    let sleepTimeMs = 500;
    while (!queryResults.jobComplete) {
      Utilities.sleep(sleepTimeMs);
      sleepTimeMs *= 2; // Exponential backoff
      queryResults = BigQuery.Jobs.getQueryResults(projectId, jobId);
    }
    
    if (!queryResults.rows) {
      return null; // Return null if there are no rows.
    }
    
    // Format the results into a 2D array
    const rows = queryResults.rows;
    const headers = queryResults.schema.fields.map(field => field.name);
    
    const data = [headers];
    for (const row of rows) {
      data.push(row.f.map(cell => cell.v));
    }
    
    return data;
  }
};