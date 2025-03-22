// Configuration
const API_BASE_URL = '/api'; // Replace with your actual API URL

// Data storage
let currentData = {
    summary: null,
    incidents: null,
    components: null,
    metrics: null,
    lastUpdated: null
};

// Current filter settings
let currentTimePeriod = 90; // Default to 90 days

// Pagination state for incidents
const paginationState = {
    vercel: {
        page: 1,
        itemsPerPage: 5,
        totalItems: 0,
        totalPages: 1
    },
    netlify: {
        page: 1,
        itemsPerPage: 5,
        totalItems: 0,
        totalPages: 1
    }
};

// Color constants
const COLORS = {
    vercel: {
        primary: '#000000',
        secondary: 'rgba(0, 0, 0, 0.7)',
        background: 'rgba(0, 0, 0, 0.1)'
    },
    netlify: {
        primary: '#00AD9F',
        secondary: 'rgba(0, 173, 159, 0.7)',
        background: 'rgba(0, 173, 159, 0.1)'
    },
    status: {
        operational: '#00C851',
        degraded: '#FFBB33',
        partial: '#FF8800',
        major: '#FF4444',
        maintenance: '#33B5E5'
    }
};

// Charts
let metricsComparisonChart = null;
let impactComparisonChart = null;
let vercelComponentsChart = null;
let netlifyComponentsChart = null;
let incidentsTimelineChart = null;
let uptimeChart = null;
let resolutionTimeChart = null;

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', function() {
    initDashboard();
    
    // Set up period filter buttons
    document.querySelectorAll('.time-period-selector button').forEach(button => {
        button.addEventListener('click', function() {
            // Update active button styling
            document.querySelectorAll('.time-period-selector button').forEach(btn => {
                btn.classList.remove('active');
            });
            this.classList.add('active');
            
            // Update period filter and refresh visualizations
            currentTimePeriod = parseInt(this.dataset.period);
            
            // Reset pagination when period changes
            paginationState.vercel.page = 1;
            paginationState.netlify.page = 1;
            
            updateVisualizationsForPeriod();
        });
    });
    
    // Set up pagination buttons for Vercel incidents
    document.getElementById('vercel-prev-btn').addEventListener('click', function() {
        if (paginationState.vercel.page > 1) {
            paginationState.vercel.page--;
            updateProviderIncidentsPagination('vercel');
        }
    });
    
    document.getElementById('vercel-next-btn').addEventListener('click', function() {
        if (paginationState.vercel.page < paginationState.vercel.totalPages) {
            paginationState.vercel.page++;
            updateProviderIncidentsPagination('vercel');
        }
    });
    
    // Set up pagination buttons for Netlify incidents
    document.getElementById('netlify-prev-btn').addEventListener('click', function() {
        if (paginationState.netlify.page > 1) {
            paginationState.netlify.page--;
            updateProviderIncidentsPagination('netlify');
        }
    });
    
    document.getElementById('netlify-next-btn').addEventListener('click', function() {
        if (paginationState.netlify.page < paginationState.netlify.totalPages) {
            paginationState.netlify.page++;
            updateProviderIncidentsPagination('netlify');
        }
    });
    
    // Set up manual refresh
    document.getElementById('refresh-btn').addEventListener('click', refreshData);
    
    // Set up export
    document.getElementById('export-btn').addEventListener('click', openExportModal);
    document.getElementById('closeModal').addEventListener('click', closeExportModal);
    document.getElementById('downloadExport').addEventListener('click', downloadExportedData);
    
    // Set up history saving
    document.getElementById('save-history-btn').addEventListener('click', saveCurrentDataToHistory);
    
    // Load historical data
    loadHistoricalData();
    
    // Set up auto-refresh (every 5 minutes)
    setInterval(refreshData, 30 * 60 * 1000);
});

// Initialize the dashboard
async function initDashboard() {
    try {
        // Fetch all data
        await fetchAllData();
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showError('Failed to load dashboard data. Please try refreshing the page.');
    }
}

// Show error message
function showError(message) {
    // Simple error display - in a real app you'd want something more sophisticated
    alert(message);
}

// Fetch all data from the API
async function fetchAllData() {
    try {
        // Show loading state
        document.getElementById('last-updated').textContent = 'Updating...';
        
        // Fetch summary, incidents, and metrics data
        const [summary, incidents, components, metrics] = await Promise.all([
            fetchData(`${API_BASE_URL}/summary`),
            fetchData(`${API_BASE_URL}/incidents`),
            fetchData(`${API_BASE_URL}/components`),
            fetchData(`${API_BASE_URL}/metrics`)
        ]);
        
        // Store the current data
        currentData = {
            summary: summary,
            incidents: incidents,
            components: components,
            metrics: metrics,
            lastUpdated: new Date().toISOString()
        };
        
        // Update the dashboard with the fetched data
        updateCurrentStatus(summary);
        updateComponentsStatus(components);
        updateVisualizationsForPeriod();
        
        // Update last updated timestamp
        const now = new Date();
        document.getElementById('last-updated').textContent = `Last updated: ${now.toLocaleTimeString()}`;
    } catch (error) {
        console.error('Error fetching data:', error);
        document.getElementById('last-updated').textContent = 'Update failed';
        throw error;
    }
}

// Fetch data from the API
async function fetchData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error fetching data from ${url}:`, error);
        throw error;
    }
}

// Refresh all data
function refreshData() {
    fetchAllData().catch(error => {
        console.error('Error refreshing data:', error);
        showError('Failed to refresh data. Please try again later.');
    });
}

// Update visualizations based on the selected time period
function updateVisualizationsForPeriod() {
    console.log(`Updating visualizations for ${currentTimePeriod} day period`);
    
    if (!currentData || !currentData.incidents || !currentData.metrics) {
        console.warn('No data available to filter');
        return;
    }
    
    // Filter incidents by the selected time period
    const filteredData = filterDataByPeriod(currentData, currentTimePeriod);
    
    // Recalculate metrics based on the filtered incidents
    const filteredMetrics = calculateFilteredMetrics(filteredData);
    
    // Update pagination totals
    updatePaginationTotals(filteredData.incidents);
    
    // Update the charts and displays with the filtered data
    updateMetricsCharts(filteredMetrics);
    updateIncidentsTimeline(filteredData.incidents);
    updateRecentIncidents(filteredData.incidents);
    updateSummaryStats(filteredMetrics);
}

// Update pagination totals
function updatePaginationTotals(incidents) {
    if (!incidents) return;
    
    // Update Vercel pagination
    if (incidents.vercel && incidents.vercel.incidents) {
        paginationState.vercel.totalItems = incidents.vercel.incidents.length;
        paginationState.vercel.totalPages = Math.ceil(paginationState.vercel.totalItems / paginationState.vercel.itemsPerPage);
        if (paginationState.vercel.page > paginationState.vercel.totalPages) {
            paginationState.vercel.page = Math.max(1, paginationState.vercel.totalPages);
        }
    }
    
    // Update Netlify pagination
    if (incidents.netlify && incidents.netlify.incidents) {
        paginationState.netlify.totalItems = incidents.netlify.incidents.length;
        paginationState.netlify.totalPages = Math.ceil(paginationState.netlify.totalItems / paginationState.netlify.itemsPerPage);
        if (paginationState.netlify.page > paginationState.netlify.totalPages) {
            paginationState.netlify.page = Math.max(1, paginationState.netlify.totalPages);
        }
    }
}

// Filter data by time period
function filterDataByPeriod(data, days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const filteredData = {
        summary: data.summary,
        components: data.components,
        incidents: {
            vercel: { incidents: [] },
            netlify: { incidents: [] }
        }
    };
    
    // Filter Vercel incidents
    if (data.incidents && data.incidents.vercel && data.incidents.vercel.incidents) {
        filteredData.incidents.vercel.incidents = data.incidents.vercel.incidents.filter(incident => {
            const incidentDate = new Date(incident.created_at);
            return incidentDate >= cutoffDate;
        });
    }
    
    // Filter Netlify incidents
    if (data.incidents && data.incidents.netlify && data.incidents.netlify.incidents) {
        filteredData.incidents.netlify.incidents = data.incidents.netlify.incidents.filter(incident => {
            const incidentDate = new Date(incident.created_at);
            return incidentDate >= cutoffDate;
        });
    }
    
    return filteredData;
}

// Calculate metrics based on filtered data
function calculateFilteredMetrics(filteredData) {
    const metrics = {
        vercel: {
            totalIncidents: 0,
            resolvedIncidents: 0,
            totalDowntime: 0,
            avgResolutionTime: 0,
            impactBreakdown: { critical: 0, major: 0, minor: 0, none: 0 },
            componentBreakdown: {}
        },
        netlify: {
            totalIncidents: 0,
            resolvedIncidents: 0,
            totalDowntime: 0,
            avgResolutionTime: 0,
            impactBreakdown: { critical: 0, major: 0, minor: 0, none: 0 },
            componentBreakdown: {}
        }
    };
    
    // Process Vercel incidents
    if (filteredData.incidents && filteredData.incidents.vercel && filteredData.incidents.vercel.incidents) {
        const vercelIncidents = filteredData.incidents.vercel.incidents;
        metrics.vercel.totalIncidents = vercelIncidents.length;
        
        vercelIncidents.forEach(incident => {
            // Count by impact level
            metrics.vercel.impactBreakdown[incident.impact] = 
                (metrics.vercel.impactBreakdown[incident.impact] || 0) + 1;
            
            // Count resolved incidents
            if (incident.status === 'resolved') {
                metrics.vercel.resolvedIncidents++;
                
                // Calculate downtime for resolved incidents
                if (incident.resolved_at && incident.created_at) {
                    const startTime = new Date(incident.created_at);
                    const endTime = new Date(incident.resolved_at);
                    const downtimeMinutes = Math.round((endTime - startTime) / (1000 * 60));
                    metrics.vercel.totalDowntime += downtimeMinutes;
                }
            }
            
            // Track affected components
            if (incident.components) {
                incident.components.forEach(component => {
                    metrics.vercel.componentBreakdown[component.name] = 
                        (metrics.vercel.componentBreakdown[component.name] || 0) + 1;
                });
            }
        });
        
        // Calculate average resolution time
        if (metrics.vercel.resolvedIncidents > 0) {
            metrics.vercel.avgResolutionTime = 
                Math.round(metrics.vercel.totalDowntime / metrics.vercel.resolvedIncidents);
        }
    }
    
    // Process Netlify incidents
    if (filteredData.incidents && filteredData.incidents.netlify && filteredData.incidents.netlify.incidents) {
        const netlifyIncidents = filteredData.incidents.netlify.incidents;
        metrics.netlify.totalIncidents = netlifyIncidents.length;
        
        netlifyIncidents.forEach(incident => {
            // Count by impact level
            metrics.netlify.impactBreakdown[incident.impact] = 
                (metrics.netlify.impactBreakdown[incident.impact] || 0) + 1;
            
            // Count resolved incidents
            if (incident.status === 'resolved') {
                metrics.netlify.resolvedIncidents++;
                
                // Calculate downtime for resolved incidents
                if (incident.resolved_at && incident.created_at) {
                    const startTime = new Date(incident.created_at);
                    const endTime = new Date(incident.resolved_at);
                    const downtimeMinutes = Math.round((endTime - startTime) / (1000 * 60));
                    metrics.netlify.totalDowntime += downtimeMinutes;
                }
            }
            
            // Track affected components
            if (incident.components) {
                incident.components.forEach(component => {
                    metrics.netlify.componentBreakdown[component.name] = 
                        (metrics.netlify.componentBreakdown[component.name] || 0) + 1;
                });
            }
        });
        
        // Calculate average resolution time
        if (metrics.netlify.resolvedIncidents > 0) {
            metrics.netlify.avgResolutionTime = 
                Math.round(metrics.netlify.totalDowntime / metrics.netlify.resolvedIncidents);
        }
    }
    
    return metrics;
}

// Update the summary statistics in the overview section
function updateSummaryStats(metrics) {
    if (!metrics) return;
    
    // Update incident counts
    document.getElementById('vercel-incident-count').textContent = metrics.vercel.totalIncidents;
    document.getElementById('netlify-incident-count').textContent = metrics.netlify.totalIncidents;
    
    // Calculate uptime percentage
    const vercelUptime = calculateUptimePercentage(metrics.vercel);
    const netlifyUptime = calculateUptimePercentage(metrics.netlify);
    
    // Update uptime displays
    document.getElementById('vercel-uptime').textContent = `${vercelUptime.toFixed(3)}%`;
    document.getElementById('netlify-uptime').textContent = `${netlifyUptime.toFixed(3)}%`;
    
    // Update resolution time displays
    document.getElementById('vercel-resolution').textContent = `${metrics.vercel.avgResolutionTime} min`;
    document.getElementById('netlify-resolution').textContent = `${metrics.netlify.avgResolutionTime} min`;
}

// Update current status section
function updateCurrentStatus(data) {
    if (!data || !data.vercel || !data.netlify) return;
    
    // Update Vercel status
    const vercelStatus = data.vercel.status;
    updateStatusIndicator('vercel', vercelStatus.indicator, vercelStatus.description);
    
    // Update Netlify status
    const netlifyStatus = data.netlify.status;
    updateStatusIndicator('netlify', netlifyStatus.indicator, netlifyStatus.description);
}

// Update status indicator
function updateStatusIndicator(provider, indicator, description) {
    const statusElement = document.getElementById(`${provider}-status-indicator`);
    if (!statusElement) return;
    
    // Determine status class
    let statusClass = 'status-operational';
    if (indicator === 'critical' || indicator === 'major') {
        statusClass = 'status-major';
    } else if (indicator === 'minor') {
        statusClass = 'status-degraded';
    } else if (indicator === 'maintenance') {
        statusClass = 'status-maintenance';
    }
    
    // Update the status indicator
    statusElement.innerHTML = `
        <span class="status-dot ${statusClass}"></span>
        <span class="text-sm font-medium">${description || 'Unknown Status'}</span>
    `;
}

// Update components status
function updateComponentsStatus(data) {
    if (!data || !data.vercel || !data.netlify) return;
    
    // Update Vercel components
    updateProviderComponents('vercel', data.vercel.components);
    
    // Update Netlify components
    updateProviderComponents('netlify', data.netlify.components);
}

// Update provider components
function updateProviderComponents(provider, components) {
    if (!components || components.length === 0) return;
    
    const containerElement = document.getElementById(`${provider}-components-status`);
    if (!containerElement) return;
    
    // Filter to just show key components (max 5)
    const keyComponents = components.slice(0, 5);
    
    // Create HTML for components
    const componentsHtml = keyComponents.map(component => {
        let statusClass = 'status-operational';
        if (component.status === 'major_outage' || component.status === 'critical') {
            statusClass = 'status-major';
        } else if (component.status === 'partial_outage') {
            statusClass = 'status-partial';
        } else if (component.status === 'degraded_performance') {
            statusClass = 'status-degraded';
        }
        
        return `
            <div class="mb-2">
                <div class="flex items-center justify-between">
                    <span class="text-sm">${component.name}</span>
                    <span class="flex items-center">
                        <span class="status-dot ${statusClass}"></span>
                        <span class="text-xs">${formatStatus(component.status)}</span>
                    </span>
                </div>
            </div>
        `;
    }).join('');
    
    // Update the container
    containerElement.innerHTML = componentsHtml;
}

// Format status for display
function formatStatus(status) {
    if (!status) return 'Unknown';
    
    // Convert snake_case to Title Case
    return status.split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// Update metrics charts
function updateMetricsCharts(data) {
    if (!data || !data.vercel || !data.netlify) return;
    
    // Update comparison chart
    updateMetricsComparisonChart(data);
    
    // Update impact chart
    updateImpactComparisonChart(data);
    
    // Update components charts
    updateComponentsCharts(data);
    
    // Update uptime chart
    updateUptimeChart(data);
    
    // Update resolution time chart
    updateResolutionTimeChart(data);
}

// Update metrics comparison chart
function updateMetricsComparisonChart(data) {
    const ctx = document.getElementById('metrics-comparison-chart');
    if (!ctx) return;
    
    // Prepare data
    const chartData = {
        labels: ['Total Incidents', 'Downtime (hrs)', 'Avg Resolution (min)'],
        datasets: [
            {
                label: 'Vercel',
                data: [
                    data.vercel.totalIncidents,
                    Math.round(data.vercel.totalDowntime / 60), // Convert to hours
                    data.vercel.avgResolutionTime
                ],
                backgroundColor: COLORS.vercel.secondary,
                borderColor: COLORS.vercel.primary,
                borderWidth: 1
            },
            {
                label: 'Netlify',
                data: [
                    data.netlify.totalIncidents,
                    Math.round(data.netlify.totalDowntime / 60), // Convert to hours
                    data.netlify.avgResolutionTime
                ],
                backgroundColor: COLORS.netlify.secondary,
                borderColor: COLORS.netlify.primary,
                borderWidth: 1
            }
        ]
    };
    
    // Create or update the chart
    if (metricsComparisonChart) {
        metricsComparisonChart.data = chartData;
        metricsComparisonChart.update();
    } else {
        metricsComparisonChart = new Chart(ctx, {
            type: 'bar',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                let value = context.parsed.y;
                                let unit = '';
                                
                                // Add appropriate units
                                if (context.dataIndex === 1) {
                                    unit = ' hours';
                                } else if (context.dataIndex === 2) {
                                    unit = ' minutes';
                                }
                                
                                return `${label}: ${value}${unit}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }
}

// Update impact comparison chart
function updateImpactComparisonChart(data) {
    const ctx = document.getElementById('impact-comparison-chart');
    if (!ctx) return;
    
    // Prepare data
    const chartData = {
        labels: ['Critical', 'Major', 'Minor', 'None'],
        datasets: [
            {
                label: 'Vercel',
                data: [
                    data.vercel.impactBreakdown.critical || 0,
                    data.vercel.impactBreakdown.major || 0,
                    data.vercel.impactBreakdown.minor || 0,
                    data.vercel.impactBreakdown.none || 0
                ],
                backgroundColor: COLORS.vercel.secondary,
                borderColor: COLORS.vercel.primary,
                borderWidth: 1
            },
            {
                label: 'Netlify',
                data: [
                    data.netlify.impactBreakdown.critical || 0,
                    data.netlify.impactBreakdown.major || 0,
                    data.netlify.impactBreakdown.minor || 0,
                    data.netlify.impactBreakdown.none || 0
                ],
                backgroundColor: COLORS.netlify.secondary,
                borderColor: COLORS.netlify.primary,
                borderWidth: 1
            }
        ]
    };
    
    // Create or update the chart
    if (impactComparisonChart) {
        impactComparisonChart.data = chartData;
        impactComparisonChart.update();
    } else {
        impactComparisonChart = new Chart(ctx, {
            type: 'bar',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Incidents'
                        }
                    }
                }
            }
        });
    }
}

// Update components charts
function updateComponentsCharts(data) {
    // Update Vercel components chart
    updateProviderComponentsChart('vercel', data.vercel.componentBreakdown);
    
    // Update Netlify components chart
    updateProviderComponentsChart('netlify', data.netlify.componentBreakdown);
}

// Update provider components chart
function updateProviderComponentsChart(provider, componentBreakdown) {
    const ctx = document.getElementById(`${provider}-components-chart`);
    if (!ctx || !componentBreakdown) return;
    
    // Sort and get top 5 components
    const topComponents = Object.entries(componentBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    
    if (topComponents.length === 0) {
        document.getElementById(`${provider}-components-chart-container`).innerHTML = 
            '<p class="text-gray-500 text-center mt-10">No component data available</p>';
        return;
    }
    
    // Prepare data
    const labels = topComponents.map(item => item[0]);
    const values = topComponents.map(item => item[1]);
    
    const chartData = {
        labels: labels,
        datasets: [{
            label: 'Incident Count',
            data: values,
            backgroundColor: provider === 'vercel' ? COLORS.vercel.secondary : COLORS.netlify.secondary,
            borderColor: provider === 'vercel' ? COLORS.vercel.primary : COLORS.netlify.primary,
            borderWidth: 1
        }]
    };
    
    // Check if chart already exists and destroy it before creating a new one
    if (provider === 'vercel' && vercelComponentsChart) {
        vercelComponentsChart.destroy();
        vercelComponentsChart = null;
    } 
    else if (provider === 'netlify' && netlifyComponentsChart) {
        netlifyComponentsChart.destroy();
        netlifyComponentsChart = null;
    }
    
    // Create new chart
    const newChart = new Chart(ctx, {
        type: 'bar',
        data: chartData,
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Incidents'
                    }
                }
            }
        }
    });
    
    // Store the chart reference
    if (provider === 'vercel') {
        vercelComponentsChart = newChart;
    } else {
        netlifyComponentsChart = newChart;
    }
}

// Update incidents timeline
const updateIncidentsTimeline = function(data) {
    const ctx = document.getElementById('incidents-timeline-chart');
    if (!ctx || !data || !data.vercel || !data.netlify) return;
    
    // Process incidents
    const vercelIncidents = data.vercel.incidents || [];
    const netlifyIncidents = data.netlify.incidents || [];
    
    // Prepare data for timeline chart - based on the selected time period
    const periodCutoffDate = new Date();
    periodCutoffDate.setDate(periodCutoffDate.getDate() - currentTimePeriod);
    
    const vercelPoints = vercelIncidents
        .filter(incident => new Date(incident.created_at) >= periodCutoffDate)
        .map(incident => {
            const created = new Date(incident.created_at);
            const resolved = incident.resolved_at ? new Date(incident.resolved_at) : null;
            const duration = resolved 
                ? Math.round((resolved - created) / (1000 * 60)) 
                : 0;
            
            return {
                x: created,
                y: duration,
                name: incident.name,
                impact: incident.impact,
                status: incident.status
            };
        });
    
    const netlifyPoints = netlifyIncidents
        .filter(incident => new Date(incident.created_at) >= periodCutoffDate)
        .map(incident => {
            const created = new Date(incident.created_at);
            const resolved = incident.resolved_at ? new Date(incident.resolved_at) : null;
            const duration = resolved 
                ? Math.round((resolved - created) / (1000 * 60)) 
                : 0;
            
            return {
                x: created,
                y: duration,
                name: incident.name,
                impact: incident.impact,
                status: incident.status
            };
        });
    
    const chartData = {
        datasets: [
            {
                label: 'Vercel Incidents',
                data: vercelPoints,
                backgroundColor: COLORS.vercel.secondary,
                borderColor: COLORS.vercel.primary,
                borderWidth: 1,
                pointRadius: 6,
                pointHoverRadius: 8
            },
            {
                label: 'Netlify Incidents',
                data: netlifyPoints,
                backgroundColor: COLORS.netlify.secondary,
                borderColor: COLORS.netlify.primary,
                borderWidth: 1,
                pointRadius: 6,
                pointHoverRadius: 8
            }
        ]
    };
    
    // Create or update the chart
    if (incidentsTimelineChart) {
        incidentsTimelineChart.data = chartData;
        incidentsTimelineChart.update();
    } else {
        incidentsTimelineChart = new Chart(ctx, {
            type: 'scatter',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const point = context.raw;
                                return [
                                    point.name,
                                    `Date: ${new Date(point.x).toLocaleDateString()}`,
                                    `Duration: ${point.y} minutes`,
                                    `Impact: ${point.impact}`,
                                    `Status: ${point.status}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day'
                        },
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Duration (minutes)'
                        }
                    }
                }
            }
        });
    }
}

// Update recent incidents
function updateRecentIncidents(data) {
    if (!data || !data.vercel || !data.netlify) return;
    
    // Update Vercel incidents
    updateProviderIncidents('vercel', data.vercel.incidents || []);
    
    // Update Netlify incidents
    updateProviderIncidents('netlify', data.netlify.incidents || []);
}
// Update provider incidents with pagination
function updateProviderIncidents(provider, incidents) {
    const containerElement = document.getElementById(`${provider}-incidents-list`);
    if (!containerElement) return;
    
    // Filter by the selected time period
    const periodCutoffDate = new Date();
    periodCutoffDate.setDate(periodCutoffDate.getDate() - currentTimePeriod);
    
    const filteredIncidents = incidents
        .filter(incident => new Date(incident.created_at) >= periodCutoffDate);
    
    // Update pagination state
    const paginationInfo = paginationState[provider];
    paginationInfo.totalItems = filteredIncidents.length;
    paginationInfo.totalPages = Math.ceil(paginationInfo.totalItems / paginationInfo.itemsPerPage);
    
    // Get page of incidents
    updateProviderIncidentsPagination(provider);
}

// Update incidents for a specific page
function updateProviderIncidentsPagination(provider) {
    const containerElement = document.getElementById(`${provider}-incidents-list`);
    if (!containerElement) return;
    
    // Get pagination info
    const paginationInfo = paginationState[provider];
    const page = paginationInfo.page;
    const itemsPerPage = paginationInfo.itemsPerPage;
    
    // Get incidents for current period
    const periodCutoffDate = new Date();
    periodCutoffDate.setDate(periodCutoffDate.getDate() - currentTimePeriod);
    
    let incidents = [];
    if (currentData && currentData.incidents && currentData.incidents[provider] && currentData.incidents[provider].incidents) {
        incidents = currentData.incidents[provider].incidents
            .filter(incident => new Date(incident.created_at) >= periodCutoffDate);
    }
    
    // Calculate pagination
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageIncidents = incidents.slice(startIndex, endIndex);
    
    // Update pagination UI
    document.getElementById(`${provider}-pagination-info`).textContent = 
        `Page ${page} of ${Math.max(1, paginationInfo.totalPages)}`;
    
    // Update prev/next buttons
    document.getElementById(`${provider}-prev-btn`).disabled = page <= 1;
    document.getElementById(`${provider}-next-btn`).disabled = page >= paginationInfo.totalPages;
    
    if (pageIncidents.length === 0) {
        containerElement.innerHTML = `<p class="text-gray-500">No incidents in the last ${currentTimePeriod} days.</p>`;
        return;
    }
    
    // Create HTML for incidents
    const incidentsHtml = pageIncidents.map(incident => {
        const createdDate = new Date(incident.created_at).toLocaleString();
        const resolvedDate = incident.resolved_at 
            ? new Date(incident.resolved_at).toLocaleString() 
            : 'Ongoing';
        
        let statusClass = 'bg-green-100 text-green-800';
        if (incident.impact === 'critical') {
            statusClass = 'bg-red-100 text-red-800';
        } else if (incident.impact === 'major') {
            statusClass = 'bg-orange-100 text-orange-800';
        } else if (incident.impact === 'minor') {
            statusClass = 'bg-yellow-100 text-yellow-800';
        }
        
        return `
            <div class="border-l-4 border-gray-200 p-4 bg-gray-50 rounded">
                <div class="flex justify-between mb-2">
                    <h4 class="font-medium">${incident.name}</h4>
                    <span class="px-2 py-1 text-xs rounded-full ${statusClass}">
                        ${incident.impact.toUpperCase()}
                    </span>
                </div>
                <div class="text-xs text-gray-500">
                    <p>Started: ${createdDate}</p>
                    <p>Resolved: ${resolvedDate}</p>
                    <p>Status: ${incident.status}</p>
                </div>
            </div>
        `;
    }).join('');
    
    // Update the container
    containerElement.innerHTML = incidentsHtml;
}

// Calculate uptime percentage for a given time period
function calculateUptimePercentage(providerData) {
    if (!providerData) return 100;
    
    // Calculate total minutes in the selected time period
    const totalMinutesInPeriod = currentTimePeriod * 24 * 60;
    const downtime = providerData.totalDowntime || 0;
    
    const uptime = (totalMinutesInPeriod - downtime) / totalMinutesInPeriod * 100;
    return Math.min(100, Math.max(99, uptime)); // Clamp between 99 and 100 for better visualization
}

// Update uptime chart
function updateUptimeChart(data) {
    const ctx = document.getElementById('uptime-chart');
    if (!ctx) return;
    
    // Calculate uptime percentage
    const vercelUptime = calculateUptimePercentage(data.vercel);
    const netlifyUptime = calculateUptimePercentage(data.netlify);
    
    const chartData = {
        labels: ['Estimated Uptime'],
        datasets: [
            {
                label: 'Vercel',
                data: [vercelUptime],
                backgroundColor: COLORS.vercel.secondary,
                borderColor: COLORS.vercel.primary,
                borderWidth: 1
            },
            {
                label: 'Netlify',
                data: [netlifyUptime],
                backgroundColor: COLORS.netlify.secondary,
                borderColor: COLORS.netlify.primary,
                borderWidth: 1
            }
        ]
    };
    
    // Create or update the chart
    if (uptimeChart) {
        uptimeChart.data = chartData;
        uptimeChart.update();
    } else {
        uptimeChart = new Chart(ctx, {
            type: 'bar',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y.toFixed(3)}%`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        min: 99, // Start from 99% to better visualize small differences
                        max: 100,
                        title: {
                            display: true,
                            text: 'Uptime Percentage'
                        }
                    }
                }
            }
        });
    }
}

// Update resolution time chart
function updateResolutionTimeChart(data) {
    const ctx = document.getElementById('resolution-time-chart');
    if (!ctx) return;
    
    const chartData = {
        labels: ['Average Resolution Time'],
        datasets: [
            {
                label: 'Vercel',
                data: [data.vercel.avgResolutionTime || 0],
                backgroundColor: COLORS.vercel.secondary,
                borderColor: COLORS.vercel.primary,
                borderWidth: 1
            },
            {
                label: 'Netlify',
                data: [data.netlify.avgResolutionTime || 0],
                backgroundColor: COLORS.netlify.secondary,
                borderColor: COLORS.netlify.primary,
                borderWidth: 1
            }
        ]
    };
    
    // Create or update the chart
    if (resolutionTimeChart) {
        resolutionTimeChart.data = chartData;
        resolutionTimeChart.update();
    } else {
        resolutionTimeChart = new Chart(ctx, {
            type: 'bar',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y} minutes`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Minutes'
                        }
                    }
                }
            }
        });
    }
}

// Export and history functions

// Open export modal
function openExportModal() {
    document.getElementById('exportModal').classList.add('show');
}

// Close export modal
function closeExportModal() {
    document.getElementById('exportModal').classList.remove('show');
}

// Download exported data
function downloadExportedData() {
    // Get export options
    const exportFormat = document.querySelector('input[name="exportFormat"]:checked').value;
    const includeCurrentStatus = document.getElementById('exportCurrentStatus').checked;
    const includeMetrics = document.getElementById('exportMetrics').checked;
    const includeIncidents = document.getElementById('exportIncidents').checked;
    const includeComponents = document.getElementById('exportComponents').checked;
    
    // Prepare data to export
    const exportData = {
        periodDays: currentTimePeriod
    };
    
    if (includeCurrentStatus && currentData.summary) {
        exportData.currentStatus = {
            vercel: currentData.summary.vercel?.status,
            netlify: currentData.summary.netlify?.status
        };
    }
    
    if (includeMetrics && currentData.metrics) {
        // Filter metrics to the current time period
        const filteredData = filterDataByPeriod(currentData, currentTimePeriod);
        const filteredMetrics = calculateFilteredMetrics(filteredData);
        exportData.metrics = filteredMetrics;
    }
    
    if (includeIncidents && currentData.incidents) {
        // Filter incidents to the current time period
        const filteredData = filterDataByPeriod(currentData, currentTimePeriod);
        exportData.incidents = {
            vercel: filteredData.incidents.vercel?.incidents || [],
            netlify: filteredData.incidents.netlify?.incidents || []
        };
    }
    
    if (includeComponents && currentData.components) {
        exportData.components = {
            vercel: currentData.components.vercel?.components || [],
            netlify: currentData.components.netlify?.components || []
        };
    }
    
    // Add export date
    exportData.exportDate = new Date().toISOString();
    
    // Export based on selected format
    if (exportFormat === 'json') {
        exportAsJson(exportData);
    } else if (exportFormat === 'csv') {
        exportAsCsv(exportData);
    } else if (exportFormat === 'excel') {
        exportAsExcel(exportData);
    }
    
    // Close the modal
    closeExportModal();
}

// Export as JSON
function exportAsJson(data) {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    saveAs(blob, `vercel-netlify-status-${timestamp}.json`);
}

// Export as CSV
function exportAsCsv(data) {
    // Simplified export - just create a metrics comparison
    let csvContent = `Period: Last ${data.periodDays} days\n`;
    csvContent += 'Metric,Vercel,Netlify\n';
    
    if (data.metrics) {
        csvContent += `Total Incidents,${data.metrics.vercel.totalIncidents},${data.metrics.netlify.totalIncidents}\n`;
        csvContent += `Total Downtime (minutes),${data.metrics.vercel.totalDowntime},${data.metrics.netlify.totalDowntime}\n`;
        csvContent += `Average Resolution Time (minutes),${data.metrics.vercel.avgResolutionTime},${data.metrics.netlify.avgResolutionTime}\n`;
        csvContent += `Uptime Percentage,${calculateUptimePercentage(data.metrics.vercel).toFixed(4)},${calculateUptimePercentage(data.metrics.netlify).toFixed(4)}\n`;
        
        // Add impact breakdown
        csvContent += '\nImpact,Vercel,Netlify\n';
        csvContent += `Critical,${data.metrics.vercel.impactBreakdown.critical || 0},${data.metrics.netlify.impactBreakdown.critical || 0}\n`;
        csvContent += `Major,${data.metrics.vercel.impactBreakdown.major || 0},${data.metrics.netlify.impactBreakdown.major || 0}\n`;
        csvContent += `Minor,${data.metrics.vercel.impactBreakdown.minor || 0},${data.metrics.netlify.impactBreakdown.minor || 0}\n`;
        csvContent += `None,${data.metrics.vercel.impactBreakdown.none || 0},${data.metrics.netlify.impactBreakdown.none || 0}\n`;
        
        // Add current status
        if (data.currentStatus) {
            csvContent += '\nCurrent Status,Vercel,Netlify\n';
            csvContent += `Description,${data.currentStatus.vercel?.description || 'Unknown'},${data.currentStatus.netlify?.description || 'Unknown'}\n`;
            csvContent += `Indicator,${data.currentStatus.vercel?.indicator || 'Unknown'},${data.currentStatus.netlify?.indicator || 'Unknown'}\n`;
        }
        
        // Add export date
        csvContent += `\nExport Date,${data.exportDate}\n`;
    } else {
        csvContent += 'No metrics data available\n';
    }
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    saveAs(blob, `vercel-netlify-status-${timestamp}.csv`);
}

// Export as Excel
function exportAsExcel(data) {
    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Create summary worksheet
    const summaryData = [
        ['Vercel vs Netlify Status Comparison'],
        [`Period: Last ${data.periodDays} days`],
        ['Export Date', data.exportDate],
        [''],
        ['Metrics', 'Vercel', 'Netlify']
    ];
    
    if (data.metrics) {
        summaryData.push(['Total Incidents', data.metrics.vercel.totalIncidents, data.metrics.netlify.totalIncidents]);
        summaryData.push(['Total Downtime (minutes)', data.metrics.vercel.totalDowntime, data.metrics.netlify.totalDowntime]);
        summaryData.push(['Average Resolution Time (minutes)', data.metrics.vercel.avgResolutionTime, data.metrics.netlify.avgResolutionTime]);
        summaryData.push(['Uptime Percentage', calculateUptimePercentage(data.metrics.vercel).toFixed(4), calculateUptimePercentage(data.metrics.netlify).toFixed(4)]);
        
        summaryData.push(['']);
        summaryData.push(['Impact Breakdown', 'Vercel', 'Netlify']);
        summaryData.push(['Critical', data.metrics.vercel.impactBreakdown.critical || 0, data.metrics.netlify.impactBreakdown.critical || 0]);
        summaryData.push(['Major', data.metrics.vercel.impactBreakdown.major || 0, data.metrics.netlify.impactBreakdown.major || 0]);
        summaryData.push(['Minor', data.metrics.vercel.impactBreakdown.minor || 0, data.metrics.netlify.impactBreakdown.minor || 0]);
        summaryData.push(['None', data.metrics.vercel.impactBreakdown.none || 0, data.metrics.netlify.impactBreakdown.none || 0]);
    }
    if (data.currentStatus) {
        summaryData.push(['']);
        summaryData.push(['Current Status', 'Vercel', 'Netlify']);
        summaryData.push(['Description', data.currentStatus.vercel?.description || 'Unknown', data.currentStatus.netlify?.description || 'Unknown']);
        summaryData.push(['Indicator', data.currentStatus.vercel?.indicator || 'Unknown', data.currentStatus.netlify?.indicator || 'Unknown']);
    }
    
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
    
    // Add incidents worksheets if available
    if (data.incidents) {
        // Vercel incidents
        if (data.incidents.vercel && data.incidents.vercel.length > 0) {
            const vercelIncidentsData = [
                ['Name', 'Created At', 'Resolved At', 'Status', 'Impact']
            ];
            
            data.incidents.vercel.forEach(incident => {
                vercelIncidentsData.push([
                    incident.name,
                    incident.created_at,
                    incident.resolved_at || 'Ongoing',
                    incident.status,
                    incident.impact
                ]);
            });
            
            const vercelIncidentsWs = XLSX.utils.aoa_to_sheet(vercelIncidentsData);
            XLSX.utils.book_append_sheet(wb, vercelIncidentsWs, 'Vercel Incidents');
        }
        
        // Netlify incidents
        if (data.incidents.netlify && data.incidents.netlify.length > 0) {
            const netlifyIncidentsData = [
                ['Name', 'Created At', 'Resolved At', 'Status', 'Impact']
            ];
            
            data.incidents.netlify.forEach(incident => {
                netlifyIncidentsData.push([
                    incident.name,
                    incident.created_at,
                    incident.resolved_at || 'Ongoing',
                    incident.status,
                    incident.impact
                ]);
            });
            
            const netlifyIncidentsWs = XLSX.utils.aoa_to_sheet(netlifyIncidentsData);
            XLSX.utils.book_append_sheet(wb, netlifyIncidentsWs, 'Netlify Incidents');
        }
    }
    
    // Add components worksheets if available
    if (data.components) {
        // Vercel components
        if (data.components.vercel && data.components.vercel.length > 0) {
            const vercelComponentsData = [
                ['Name', 'Status', 'Updated At']
            ];
            
            data.components.vercel.forEach(component => {
                vercelComponentsData.push([
                    component.name,
                    component.status,
                    component.updated_at
                ]);
            });
            
            const vercelComponentsWs = XLSX.utils.aoa_to_sheet(vercelComponentsData);
            XLSX.utils.book_append_sheet(wb, vercelComponentsWs, 'Vercel Components');
        }
        
        // Netlify components
        if (data.components.netlify && data.components.netlify.length > 0) {
            const netlifyComponentsData = [
                ['Name', 'Status', 'Updated At']
            ];
            
            data.components.netlify.forEach(component => {
                netlifyComponentsData.push([
                    component.name,
                    component.status,
                    component.updated_at
                ]);
            });
            
            const netlifyComponentsWs = XLSX.utils.aoa_to_sheet(netlifyComponentsData);
            XLSX.utils.book_append_sheet(wb, netlifyComponentsWs, 'Netlify Components');
        }
    }
    
    // Export workbook
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    XLSX.writeFile(wb, `vercel-netlify-status-${timestamp}.xlsx`);
}

// Historical data functions

// Save current data to history
function saveCurrentDataToHistory() {
    if (!currentData || !currentData.summary || !currentData.metrics) {
        showError('No data available to save. Please refresh the page and try again.');
        return;
    }
    
    // Get existing history from local storage
    let history = loadHistoryFromStorage();
    
    // Filter data for current time period
    const filteredData = filterDataByPeriod(currentData, currentTimePeriod);
    const filteredMetrics = calculateFilteredMetrics(filteredData);
    
    // Create a simplified entry for storage
    const entry = {
        id: Date.now().toString(), // unique ID based on timestamp
        date: new Date().toISOString(),
        periodDays: currentTimePeriod,
        vercelStatus: currentData.summary.vercel?.status?.description || 'Unknown',
        netlifyStatus: currentData.summary.netlify?.status?.description || 'Unknown',
        vercelIncidents: filteredMetrics.vercel.totalIncidents,
        netlifyIncidents: filteredMetrics.netlify.totalIncidents,
        vercelUptime: calculateUptimePercentage(filteredMetrics.vercel).toFixed(3),
        netlifyUptime: calculateUptimePercentage(filteredMetrics.netlify).toFixed(3),
        fullData: {
            summary: currentData.summary,
            incidents: filteredData.incidents,
            metrics: filteredMetrics
        }
    };
    
    // Add to history and save
    history.push(entry);
    saveHistoryToStorage(history);
    
    // Refresh the history table
    updateHistoryTable(history);
    
    alert('Current data saved to history!');
}

// Load historical data from local storage
function loadHistoricalData() {
    const history = loadHistoryFromStorage();
    updateHistoryTable(history);
}

// Load history from local storage
function loadHistoryFromStorage() {
    try {
        const storedHistory = localStorage.getItem('vercelNetlifyHistory');
        return storedHistory ? JSON.parse(storedHistory) : [];
    } catch (error) {
        console.error('Error loading history from storage:', error);
        return [];
    }
}

// Save history to local storage
function saveHistoryToStorage(history) {
    try {
        localStorage.setItem('vercelNetlifyHistory', JSON.stringify(history));
    } catch (error) {
        console.error('Error saving history to storage:', error);
        showError('Failed to save history. Local storage might be full or disabled.');
    }
}

// Update history table
function updateHistoryTable(history) {
    const tableBody = document.getElementById('history-table-body');
    if (!tableBody) return;
    
    if (history.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-4 text-center text-gray-500">No historical data saved yet.</td>
            </tr>
        `;
        return;
    }
    
    // Sort history by date (newest first)
    history.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Create table rows
    const rows = history.map(entry => {
        const date = new Date(entry.date).toLocaleString();
        
        return `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap">
                    ${date}
                    <div class="text-xs text-gray-500">Period: ${entry.periodDays || 90} days</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    ${entry.vercelStatus}
                    <div class="text-xs text-gray-500">Uptime: ${entry.vercelUptime || 'N/A'}%</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    ${entry.netlifyStatus}
                    <div class="text-xs text-gray-500">Uptime: ${entry.netlifyUptime || 'N/A'}%</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">${entry.vercelIncidents}</td>
                <td class="px-6 py-4 whitespace-nowrap">${entry.netlifyIncidents}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <button 
                        class="text-blue-600 hover:text-blue-900 mr-2"
                        onclick="exportHistoricalEntry('${entry.id}')"
                    >
                        Export
                    </button>
                    <button 
                        class="text-red-600 hover:text-red-900"
                        onclick="deleteHistoricalEntry('${entry.id}')"
                    >
                        Delete
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    tableBody.innerHTML = rows;
}

// Export a historical entry
window.exportHistoricalEntry = function(id) {
    const history = loadHistoryFromStorage();
    const entry = history.find(item => item.id === id);
    
    if (!entry) {
        showError('Entry not found.');
        return;
    }
    
    // Export the full data as JSON
    const jsonStr = JSON.stringify(entry.fullData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const timestamp = new Date(entry.date).toISOString().replace(/[:.]/g, '-');
    saveAs(blob, `vercel-netlify-status-history-${timestamp}.json`);
};

// Delete a historical entry
window.deleteHistoricalEntry = function(id) {
    if (!confirm('Are you sure you want to delete this entry?')) return;
    
    const history = loadHistoryFromStorage();
    const updatedHistory = history.filter(item => item.id !== id);
    
    saveHistoryToStorage(updatedHistory);
    updateHistoryTable(updatedHistory);
};