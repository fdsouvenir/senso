/**
 * @OnlyCurrentDoc
 *
 * Chart Generator using QuickChart.io API
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
    // Ensure we have valid data
    const values = data.map(d => {
      const val = d.value || d;
      return isNaN(val) ? 0 : Number(val);
    });

    // Default labels if not provided
    const chartLabels = labels || values.map((_, i) => `Day ${i + 1}`);

    // Chart.js configuration
    const chartConfig = {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [{
          label: title || 'Sales',
          data: values,
          borderColor: colors ? colors[0] : 'rgb(75, 192, 192)',
          backgroundColor: colors ? colors[0] + '33' : 'rgba(75, 192, 192, 0.2)',
          borderWidth: 2,
          fill: true,
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: title ? true : false,
            text: title,
            font: {
              size: 16
            }
          },
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return '$' + value.toLocaleString();
              }
            }
          }
        }
      }
    };

    // Build URL
    const chartJson = encodeURIComponent(JSON.stringify(chartConfig));
    return `https://quickchart.io/chart?c=${chartJson}&width=${width}&height=${height}&backgroundColor=white`;
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
    const values = data.map(d => d.value || d);
    const chartLabels = labels || values.map((_, i) => `Item ${i + 1}`);

    const chartConfig = {
      type: 'horizontalBar',
      data: {
        labels: chartLabels,
        datasets: [{
          label: title || 'Sales',
          data: values,
          backgroundColor: colors || 'rgba(54, 162, 235, 0.5)',
          borderColor: colors || 'rgba(54, 162, 235, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: title ? true : false,
            text: title,
            font: {
              size: 16
            }
          },
          legend: {
            display: false
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return '$' + value.toLocaleString();
              }
            }
          }
        }
      }
    };

    const chartJson = encodeURIComponent(JSON.stringify(chartConfig));
    return `https://quickchart.io/chart?c=${chartJson}&width=${width}&height=${height}&backgroundColor=white`;
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
    const values = data.map(d => d.value || d);
    const labels = data.map(d => `${d.label || d.name} ($${(d.value || 0).toFixed(0)})`);

    const chartColors = colors || this.generateColorPalette(data.length);

    const chartConfig = {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: chartColors,
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: title ? true : false,
            text: title,
            font: {
              size: 16
            }
          },
          legend: {
            position: 'bottom',
            labels: {
              font: {
                size: 11
              }
            }
          }
        }
      }
    };

    const chartJson = encodeURIComponent(JSON.stringify(chartConfig));
    return `https://quickchart.io/chart?c=${chartJson}&width=${width}&height=${height}&backgroundColor=white`;
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
    const values = data.map(d => d.value || d);
    const chartLabels = labels || values.map((_, i) => `Item ${i + 1}`);

    const chartConfig = {
      type: 'bar',
      data: {
        labels: chartLabels,
        datasets: [{
          label: title || 'Sales',
          data: values,
          backgroundColor: colors || 'rgba(255, 99, 132, 0.5)',
          borderColor: colors || 'rgba(255, 99, 132, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: title ? true : false,
            text: title,
            font: {
              size: 16
            }
          },
          legend: {
            display: false
          },
          datalabels: {
            anchor: 'end',
            align: 'top',
            formatter: function(value) {
              return '$' + value;
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return '$' + value.toLocaleString();
              }
            }
          }
        }
      }
    };

    const chartJson = encodeURIComponent(JSON.stringify(chartConfig));
    return `https://quickchart.io/chart?c=${chartJson}&width=${width}&height=${height}&backgroundColor=white`;
  },

  /**
   * Generate a comparison chart for two datasets
   * @param {Object} data1 First dataset
   * @param {Object} data2 Second dataset
   * @param {string} title Chart title
   * @returns {string} Chart URL
   */
  generateComparisonChart(data1, data2, title) {
    const values1 = data1.values || [];
    const values2 = data2.values || [];
    const labels = data1.labels || values1.map((_, i) => `Period ${i + 1}`);

    const chartConfig = {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: data1.label || 'Dataset 1',
            data: values1,
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1
          },
          {
            label: data2.label || 'Dataset 2',
            data: values2,
            backgroundColor: 'rgba(255, 99, 132, 0.5)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: title,
            font: {
              size: 16
            }
          },
          legend: {
            position: 'bottom'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return '$' + value.toLocaleString();
              }
            }
          }
        }
      }
    };

    const chartJson = encodeURIComponent(JSON.stringify(chartConfig));
    return `https://quickchart.io/chart?c=${chartJson}&width=600&height=400&backgroundColor=white`;
  },

  /**
   * Generate a trend chart with multiple lines
   * @param {Array} datasets Array of datasets
   * @param {string} title Chart title
   * @param {Array} xLabels X-axis labels
   * @returns {string} Chart URL
   */
  generateTrendChart(datasets, title, xLabels) {
    const colors = [
      'rgb(75, 192, 192)',
      'rgb(255, 99, 132)',
      'rgb(54, 162, 235)'
    ];

    const chartDatasets = datasets.map((ds, index) => ({
      label: ds.label || `Series ${index + 1}`,
      data: ds.values || [],
      borderColor: colors[index % colors.length],
      backgroundColor: colors[index % colors.length] + '33',
      borderWidth: 2,
      fill: false,
      tension: 0.1
    }));

    const chartConfig = {
      type: 'line',
      data: {
        labels: xLabels,
        datasets: chartDatasets
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: title,
            font: {
              size: 16
            }
          },
          legend: {
            position: 'bottom'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return '$' + value.toLocaleString();
              }
            }
          }
        }
      }
    };

    const chartJson = encodeURIComponent(JSON.stringify(chartConfig));
    return `https://quickchart.io/chart?c=${chartJson}&width=600&height=300&backgroundColor=white`;
  },

  /**
   * Generate a sparkline chart (small inline chart)
   * @param {Array} data Data points
   * @returns {string} Chart URL
   */
  generateSparkline(data) {
    const chartConfig = {
      type: 'line',
      data: {
        labels: data.map((_, i) => ''),
        datasets: [{
          data: data,
          borderColor: 'rgb(75, 192, 192)',
          borderWidth: 1,
          pointRadius: 0,
          fill: false
        }]
      },
      options: {
        responsive: false,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: false
          }
        },
        scales: {
          x: {
            display: false
          },
          y: {
            display: false
          }
        }
      }
    };

    const chartJson = encodeURIComponent(JSON.stringify(chartConfig));
    return `https://quickchart.io/chart?c=${chartJson}&width=100&height=30&backgroundColor=transparent`;
  },

  /**
   * Generate color palette for charts
   * @param {number} count Number of colors needed
   * @returns {Array} Array of color codes
   */
  generateColorPalette(count) {
    const baseColors = [
      'rgba(75, 192, 192, 0.6)',
      'rgba(255, 99, 132, 0.6)',
      'rgba(54, 162, 235, 0.6)',
      'rgba(255, 206, 86, 0.6)',
      'rgba(153, 102, 255, 0.6)',
      'rgba(255, 159, 64, 0.6)',
      'rgba(199, 199, 199, 0.6)',
      'rgba(83, 102, 255, 0.6)',
      'rgba(255, 99, 255, 0.6)',
      'rgba(99, 255, 132, 0.6)'
    ];

    if (count <= baseColors.length) {
      return baseColors.slice(0, count);
    }

    // Generate additional colors if needed
    const colors = [...baseColors];
    while (colors.length < count) {
      const hue = (360 * colors.length / count) % 360;
      colors.push(`hsla(${hue}, 70%, 60%, 0.6)`);
    }

    return colors;
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