const axios = require('axios');
const NodeCache = require('node-cache');

// Create a cache with a 10-minute TTL (time to live)
const cache = new NodeCache({ stdTTL: 600 });

exports.handler = async function(event, context) {
  try {
    // Try to get data from cache first
    const cachedData = cache.get('metrics');
    if (cachedData) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'max-age=600',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(cachedData)
      };
    }

  
    
    const data = {
      lastUpdated: new Date().toISOString(),
      // The front end will calculate most metrics based on incident data
      metadataOnly: true
    };

    // Store in cache
    cache.set('metrics', data);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=600',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('Error generating metrics:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Failed to generate metrics data' })
    };
  }
};