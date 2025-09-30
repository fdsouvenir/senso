/**
 * @OnlyCurrentDoc
 *
 * Chart Generator using Google Image Charts API
 * Creates various chart types for email reports
 */

const ChartGenerator = {
  /**
   * Helper function to build URL query strings (URLSearchParams not available in Apps Script)
   * @param {Object} params Parameters object
   * @returns {string} Query string
   */
  buildQueryString(params) {
    const queryParts = [];
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined) {
        queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
      }
    }
    return queryParts.join('&');
  },

  /**
   * Generate a chart URL based on data and type
   * @param {Object} options Chart options
   * @returns {string} Chart image URL
   */
  generateChart(options) {
    const {
      type = 'bar',
      data,
      title = '',
      width = Config.CHARTS.defaultWidth,
      height = Config.CHARTS.defaultHeight,
      colors = null,
      labels = null
    } = options;

    switch (type) {
      case 'bar':
        return this.generateBarChart(data, title, width, height, colors, labels);
      case 'line':
        return this.generateLineChart(data, title, width, height, colors, labels);
      case 'pie':
        return this.generatePieChart(data, title, width, height, colors);
      case 'column':
        return this.generateColumnChart(data, title, width, height, colors, labels);
      default:
        throw new Error(`Unsupported chart type: ${type}`);
    }
  },

  /**
   * Generate a bar chart URL
   * @param {Array} data Chart data
   * @param {string} title Chart title
   * @param {number} width Chart width
   * @param {number} height Chart height
   * @param {Array} colors Custom colors
   * @param {Array} labels Data labels
   * @returns {string} Chart URL
   */
  generateBarChart(data, title, width, height, colors, labels) {
    const baseUrl = Config.CHARTS.apiEndpoint;
    const params = {};

    // Chart type: horizontal bar
    params['cht'] = 'bhs';

    // Chart size
    params['chs'] = `${width}x${height}`;

    // Chart data
    const values = data.map(d => d.value || d);
    const maxValue = Math.max(...values);
    params['chd'] = `t:${values.join(',')}`;

    // Data scaling
    params['chds'] = `0,${maxValue}`;

    // Chart title
    if (title) {
      params['chtt'] = title;
    }

    // Colors
    const chartColors = colors || [Config.CHARTS.colors.primary];
    params['chco'] = chartColors.join('|');

    // Axis labels
    if (labels) {
      params['chxl'] = `1:|${labels.join('|')}`;
      params['chxt'] = 'x,y';
    }

    // Grid lines
    params['chg'] = '10,10,1,5';

    // Bar width and spacing
    params['chbh'] = 'a';

    return `${baseUrl}?${this.buildQueryString(params)}`;
  },

  /**
   * Generate a line chart URL
   * @param {Array} data Chart data
   * @param {string} title Chart title
   * @param {number} width Chart width
   * @param {number} height Chart height
   * @param {Array} colors Custom colors
   * @param {Array} labels X-axis labels
   * @returns {string} Chart URL
   */
  generateLineChart(data, title, width, height, colors, labels) {
    const baseUrl = Config.CHARTS.apiEndpoint;
    const params = {};

    // Chart type: line with markers
    params['cht'] = 'lc';

    // Chart size
    params['chs'] = `${width}x${height}`;

    // Chart data - ensure we have valid numbers
    const values = data.map(d => {
      const val = d.value || d;
      return isNaN(val) ? 0 : Number(val);
    });

    // Handle case where all values are 0 or empty
    const maxValue = Math.max(...values) || 100;
    const minValue = Math.min(...values);

    // If all values are the same, adjust range for better visibility
    const range = maxValue - minValue;
    const adjustedMax = range === 0 ? maxValue + (maxValue * 0.1 || 10) : maxValue;
    const adjustedMin = range === 0 ? Math.max(0, minValue - (maxValue * 0.1 || 10)) : minValue;

    params['chd'] = `t:${values.join(',')}`;

    // Data scaling
    params['chds'] = `${adjustedMin},${adjustedMax}`;

    // Chart title
    if (title) {
      params['chtt'] = title;
    }

    // Colors
    const chartColors = colors || [Config.CHARTS.colors.primary];
    params['chco'] = chartColors.join('|');

    // Line style (solid, 2px)
    params['chls'] = '2';

    // Markers
    params['chm'] = 'o,FFFFFF,0,-1,8';

    // Axis labels
    if (labels && labels.length > 0) {
      // X-axis labels
      params['chxl'] = `0:|${labels.join('|')}`;
      params['chxt'] = 'x,y';

      // Y-axis range
      params['chxr'] = `1,${Math.floor(adjustedMin)},${Math.ceil(adjustedMax)}`;
    }

    // Grid lines
    params['chg'] = '25,25,1,5';

    // Background
    params['chf'] = 'bg,s,FFFFFF';

    return `${baseUrl}?${this.buildQueryString(params)}`;
  },

  /**
   * Generate a pie chart URL
   * @param {Array} data Chart data with labels and values
   * @param {string} title Chart title
   * @param {number} width Chart width
   * @param {number} height Chart height
   * @param {Array} colors Custom colors
   * @returns {string} Chart URL
   */
  generatePieChart(data, title, width, height, colors) {
    const baseUrl = Config.CHARTS.apiEndpoint;
    const params = {};

    // Chart type: 3D pie
    params['cht'] = 'p3';

    // Chart size
    params['chs'] = `${width}x${height}`;

    // Chart data
    const values = data.map(d => d.value || d);
    params['chd'] = `t:${values.join(',')}`;

    // Chart title
    if (title) {
      params['chtt'] = title;
    }

    // Colors
    const chartColors = colors || this.generateColorPalette(data.length);
    params['chco'] = chartColors.join('|');

    // Labels
    const labels = data.map(d => `${d.label || d.name} (${d.value})`);
    params['chl'] = labels.join('|');

    // Legend position
    params['chdlp'] = 'b';

    return `${baseUrl}?${this.buildQueryString(params)}`;
  },

  /**
   * Generate a column chart URL
   * @param {Array} data Chart data
   * @param {string} title Chart title
   * @param {number} width Chart width
   * @param {number} height Chart height
   * @param {Array} colors Custom colors
   * @param {Array} labels X-axis labels
   * @returns {string} Chart URL
   */
  generateColumnChart(data, title, width, height, colors, labels) {
    const baseUrl = Config.CHARTS.apiEndpoint;
    const params = {};

    // Chart type: vertical bar (column)
    params['cht'] = 'bvs';

    // Chart size
    params['chs'] = `${width}x${height}`;

    // Chart data
    const values = data.map(d => d.value || d);
    const maxValue = Math.max(...values);
    params['chd'] = `t:${values.join(',')}`;

    // Data scaling
    params['chds'] = `0,${maxValue}`;

    // Chart title
    if (title) {
      params['chtt'] = title;
    }

    // Colors
    const chartColors = colors || [Config.CHARTS.colors.primary];
    params['chco'] = chartColors.join('|');

    // Axis labels
    if (labels) {
      params['chxl'] = `0:|${labels.join('|')}`;
      params['chxt'] = 'x,y';
      params['chxr'] = `1,0,${maxValue}`;
    }

    // Value labels on bars
    params['chm'] = 'N,000000,0,-1,11';

    // Bar width and spacing
    params['chbh'] = '20,5,10';

    // Grid lines
    params['chg'] = '0,10,1,5';

    return `${baseUrl}?${this.buildQueryString(params)}`;
  },

  /**
   * Generate a comparison chart for two datasets
   * @param {Object} data1 First dataset
   * @param {Object} data2 Second dataset
   * @param {string} title Chart title
   * @returns {string} Chart URL
   */
  generateComparisonChart(data1, data2, title) {
    const baseUrl = Config.CHARTS.apiEndpoint;
    const params = {};

    // Chart type: grouped bar
    params['cht'] = 'bvg';
    params['chs'] = '600x400';

    // Combine data
    const values1 = data1.values || [];
    const values2 = data2.values || [];
    const maxValue = Math.max(...values1, ...values2);

    params['chd'] = `t:${values1.join(',')}|${values2.join(',')}`;
    params['chds'] = `0,${maxValue},0,${maxValue}`;

    // Title
    params['chtt'] = title;

    // Colors
    params['chco'] = `${Config.CHARTS.colors.primary},${Config.CHARTS.colors.secondary}`;

    // Legend
    params['chdl'] = `${data1.label}|${data2.label}`;
    params['chdlp'] = 'b';

    // Labels
    if (data1.labels) {
      params['chxl'] = `0:|${data1.labels.join('|')}`;
      params['chxt'] = 'x,y';
      params['chxr'] = `1,0,${maxValue}`;
    }

    // Bar width
    params['chbh'] = '15,5,10';

    return `${baseUrl}?${this.buildQueryString(params)}`;
  },

  /**
   * Generate a trend chart with multiple lines
   * @param {Array} datasets Array of datasets
   * @param {string} title Chart title
   * @param {Array} xLabels X-axis labels
   * @returns {string} Chart URL
   */
  generateTrendChart(datasets, title, xLabels) {
    const baseUrl = Config.CHARTS.apiEndpoint;
    const params = {};

    // Chart type: line chart
    params['cht'] = 'lc';
    params['chs'] = '600x300';

    // Combine all data
    const allValues = datasets.map(ds => ds.values || []);
    const flatValues = allValues.flat();
    const maxValue = Math.max(...flatValues);
    const minValue = Math.min(...flatValues);

    // Format data for multiple series
    const dataString = allValues.map(values => values.join(',')).join('|');
    params['chd'] = `t:${dataString}`;
    params['chds'] = `${minValue},${maxValue}`;

    // Title
    params['chtt'] = title;

    // Colors
    const colors = [
      Config.CHARTS.colors.primary,
      Config.CHARTS.colors.secondary,
      Config.CHARTS.colors.accent
    ].slice(0, datasets.length);
    params['chco'] = colors.join(',');

    // Line styles
    const lineStyles = datasets.map(() => '2').join('|');
    params['chls'] = lineStyles;

    // Legend
    if (datasets.length > 1) {
      const legends = datasets.map(ds => ds.label || '').filter(l => l);
      if (legends.length > 0) {
        params['chdl'] = legends.join('|');
        params['chdlp'] = 'b';
      }
    }

    // Axis labels
    if (xLabels) {
      params['chxl'] = `0:|${xLabels.join('|')}`;
      params['chxt'] = 'x,y';
      params['chxr'] = `1,${minValue},${maxValue}`;
    }

    // Grid
    params['chg'] = '25,25,1,5';

    // Markers on data points
    params['chm'] = 'o,FFFFFF,0,-1,6';

    return `${baseUrl}?${this.buildQueryString(params)}`;
  },

  /**
   * Generate a sparkline chart (small inline chart)
   * @param {Array} data Data points
   * @returns {string} Chart URL
   */
  generateSparkline(data) {
    const baseUrl = Config.CHARTS.apiEndpoint;
    const params = {};

    params['cht'] = 'ls';
    params['chs'] = '100x30';
    params['chd'] = `t:${data.join(',')}`;
    params['chco'] = Config.CHARTS.colors.primary;
    params['chls'] = '1';
    params['chm'] = 'B,E3F2FD,0,0,0';

    return `${baseUrl}?${this.buildQueryString(params)}`;
  },

  /**
   * Generate color palette for charts
   * @param {number} count Number of colors needed
   * @returns {Array} Array of hex color codes
   */
  generateColorPalette(count) {
    const baseColors = [
      Config.CHARTS.colors.primary,
      Config.CHARTS.colors.secondary,
      Config.CHARTS.colors.accent,
      '9C27B0', // Purple
      '00BCD4', // Cyan
      'FF9800', // Orange
      '795548', // Brown
      '607D8B', // Blue Grey
      'E91E63', // Pink
      '3F51B5'  // Indigo
    ];

    if (count <= baseColors.length) {
      return baseColors.slice(0, count);
    }

    // Generate additional colors if needed
    const colors = [...baseColors];
    while (colors.length < count) {
      const hue = (360 * colors.length / count) % 360;
      const color = this.hslToHex(hue, 70, 50);
      colors.push(color.substring(1)); // Remove # for Google Charts
    }

    return colors;
  },

  /**
   * Convert HSL to hex color
   * @param {number} h Hue (0-360)
   * @param {number} s Saturation (0-100)
   * @param {number} l Lightness (0-100)
   * @returns {string} Hex color code
   */
  hslToHex(h, s, l) {
    s /= 100;
    l /= 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;

    if (0 <= h && h < 60) {
      r = c; g = x; b = 0;
    } else if (60 <= h && h < 120) {
      r = x; g = c; b = 0;
    } else if (120 <= h && h < 180) {
      r = 0; g = c; b = x;
    } else if (180 <= h && h < 240) {
      r = 0; g = x; b = c;
    } else if (240 <= h && h < 300) {
      r = x; g = 0; b = c;
    } else if (300 <= h && h < 360) {
      r = c; g = 0; b = x;
    }

    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);

    return '#' + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  },

  /**
   * Cache generated chart URLs for reuse
   * @param {string} key Cache key
   * @param {string} url Chart URL
   */
  cacheChart(key, url) {
    const cache = CacheService.getDocumentCache();
    cache.put(key, url, 3600); // Cache for 1 hour
  },

  /**
   * Get cached chart URL
   * @param {string} key Cache key
   * @returns {string|null} Cached URL or null
   */
  getCachedChart(key) {
    const cache = CacheService.getDocumentCache();
    return cache.get(key);
  },

  /**
   * Test function to generate a simple line chart
   * @returns {string} Test chart URL
   */
  generateTestChart() {
    // Simple test data
    const testData = [100, 150, 125, 175, 200];
    const testLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

    const url = this.generateLineChart(
      testData,
      'Test Sales Chart',
      600, 300,
      null,
      testLabels
    );

    Logger.log('Test chart URL: ' + url);
    return url;
  }
};