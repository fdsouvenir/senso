/**
 * @OnlyCurrentDoc
 *
 * Chart Generator using Google Image Charts API
 * Creates various chart types for email reports
 */

const ChartGenerator = {
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
    const params = new URLSearchParams();

    // Chart type: horizontal bar
    params.append('cht', 'bhs');

    // Chart size
    params.append('chs', `${width}x${height}`);

    // Chart data
    const values = data.map(d => d.value || d);
    const maxValue = Math.max(...values);
    params.append('chd', `t:${values.join(',')}`);

    // Data scaling
    params.append('chds', `0,${maxValue}`);

    // Chart title
    if (title) {
      params.append('chtt', title);
    }

    // Colors
    const chartColors = colors || [Config.CHARTS.colors.primary];
    params.append('chco', chartColors.join('|'));

    // Axis labels
    if (labels) {
      params.append('chxl', `1:|${labels.join('|')}`);
      params.append('chxt', 'x,y');
    }

    // Grid lines
    params.append('chg', '10,10,1,5');

    // Bar width and spacing
    params.append('chbh', 'a');

    return `${baseUrl}?${params.toString()}`;
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
    const params = new URLSearchParams();

    // Chart type: line with markers
    params.append('cht', 'lc');

    // Chart size
    params.append('chs', `${width}x${height}`);

    // Chart data
    const values = data.map(d => d.value || d);
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);
    params.append('chd', `t:${values.join(',')}`);

    // Data scaling
    params.append('chds', `${minValue},${maxValue}`);

    // Chart title
    if (title) {
      params.append('chtt', title);
    }

    // Colors
    const chartColors = colors || [Config.CHARTS.colors.primary];
    params.append('chco', chartColors.join('|'));

    // Line style (solid, 2px)
    params.append('chls', '2');

    // Markers
    params.append('chm', 'o,FFFFFF,0,-1,8|N,000000,0,-1,10');

    // Axis labels
    if (labels) {
      // X-axis labels
      params.append('chxl', `0:|${labels.join('|')}`);
      params.append('chxt', 'x,y');

      // Y-axis range
      params.append('chxr', `1,${minValue},${maxValue}`);
    }

    // Grid lines
    params.append('chg', '25,25,1,5');

    // Background
    params.append('chf', 'bg,s,FFFFFF');

    return `${baseUrl}?${params.toString()}`;
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
    const params = new URLSearchParams();

    // Chart type: 3D pie
    params.append('cht', 'p3');

    // Chart size
    params.append('chs', `${width}x${height}`);

    // Chart data
    const values = data.map(d => d.value || d);
    params.append('chd', `t:${values.join(',')}`);

    // Chart title
    if (title) {
      params.append('chtt', title);
    }

    // Colors
    const chartColors = colors || this.generateColorPalette(data.length);
    params.append('chco', chartColors.join('|'));

    // Labels
    const labels = data.map(d => `${d.label || d.name} (${d.value})`);
    params.append('chl', labels.join('|'));

    // Legend position
    params.append('chdlp', 'b');

    return `${baseUrl}?${params.toString()}`;
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
    const params = new URLSearchParams();

    // Chart type: vertical bar (column)
    params.append('cht', 'bvs');

    // Chart size
    params.append('chs', `${width}x${height}`);

    // Chart data
    const values = data.map(d => d.value || d);
    const maxValue = Math.max(...values);
    params.append('chd', `t:${values.join(',')}`);

    // Data scaling
    params.append('chds', `0,${maxValue}`);

    // Chart title
    if (title) {
      params.append('chtt', title);
    }

    // Colors
    const chartColors = colors || [Config.CHARTS.colors.primary];
    params.append('chco', chartColors.join('|'));

    // Axis labels
    if (labels) {
      params.append('chxl', `0:|${labels.join('|')}`);
      params.append('chxt', 'x,y');
      params.append('chxr', `1,0,${maxValue}`);
    }

    // Value labels on bars
    params.append('chm', 'N,000000,0,-1,11');

    // Bar width and spacing
    params.append('chbh', '20,5,10');

    // Grid lines
    params.append('chg', '0,10,1,5');

    return `${baseUrl}?${params.toString()}`;
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
    const params = new URLSearchParams();

    // Chart type: grouped bar
    params.append('cht', 'bvg');
    params.append('chs', '600x400');

    // Combine data
    const values1 = data1.values || [];
    const values2 = data2.values || [];
    const maxValue = Math.max(...values1, ...values2);

    params.append('chd', `t:${values1.join(',')}|${values2.join(',')}`);
    params.append('chds', `0,${maxValue},0,${maxValue}`);

    // Title
    params.append('chtt', title);

    // Colors
    params.append('chco', `${Config.CHARTS.colors.primary},${Config.CHARTS.colors.secondary}`);

    // Legend
    params.append('chdl', `${data1.label}|${data2.label}`);
    params.append('chdlp', 'b');

    // Labels
    if (data1.labels) {
      params.append('chxl', `0:|${data1.labels.join('|')}`);
      params.append('chxt', 'x,y');
      params.append('chxr', `1,0,${maxValue}`);
    }

    // Bar width
    params.append('chbh', '15,5,10');

    return `${baseUrl}?${params.toString()}`;
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
    const params = new URLSearchParams();

    // Chart type: line chart
    params.append('cht', 'lc');
    params.append('chs', '600x300');

    // Combine all data
    const allValues = datasets.map(ds => ds.values || []);
    const flatValues = allValues.flat();
    const maxValue = Math.max(...flatValues);
    const minValue = Math.min(...flatValues);

    // Format data for multiple series
    const dataString = allValues.map(values => values.join(',')).join('|');
    params.append('chd', `t:${dataString}`);
    params.append('chds', `${minValue},${maxValue}`);

    // Title
    params.append('chtt', title);

    // Colors
    const colors = [
      Config.CHARTS.colors.primary,
      Config.CHARTS.colors.secondary,
      Config.CHARTS.colors.accent
    ].slice(0, datasets.length);
    params.append('chco', colors.join(','));

    // Line styles
    const lineStyles = datasets.map(() => '2').join('|');
    params.append('chls', lineStyles);

    // Legend
    if (datasets.length > 1) {
      const legends = datasets.map(ds => ds.label || '').filter(l => l);
      if (legends.length > 0) {
        params.append('chdl', legends.join('|'));
        params.append('chdlp', 'b');
      }
    }

    // Axis labels
    if (xLabels) {
      params.append('chxl', `0:|${xLabels.join('|')}`);
      params.append('chxt', 'x,y');
      params.append('chxr', `1,${minValue},${maxValue}`);
    }

    // Grid
    params.append('chg', '25,25,1,5');

    // Markers on data points
    params.append('chm', 'o,FFFFFF,0,-1,6');

    return `${baseUrl}?${params.toString()}`;
  },

  /**
   * Generate a sparkline chart (small inline chart)
   * @param {Array} data Data points
   * @returns {string} Chart URL
   */
  generateSparkline(data) {
    const baseUrl = Config.CHARTS.apiEndpoint;
    const params = new URLSearchParams();

    params.append('cht', 'ls');
    params.append('chs', '100x30');
    params.append('chd', `t:${data.join(',')}`);
    params.append('chco', Config.CHARTS.colors.primary);
    params.append('chls', '1');
    params.append('chm', 'B,E3F2FD,0,0,0');

    return `${baseUrl}?${params.toString()}`;
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
  }
};