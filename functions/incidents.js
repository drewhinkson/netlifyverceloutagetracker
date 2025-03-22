const axios = require('axios');
const NodeCache = require('node-cache');

// Create a cache with a 5-minute TTL (time to live)
const cache = new NodeCache({ stdTTL: 300 });

// Statuspage URLs for both providers
const VERCEL_INCIDENTS_URL = 'https://www.vercel-status.com/api/v2/incidents.json';
const NETLIFY_INCIDENTS_URL = 'https://www.netlifystatus.com/api/v2/incidents.json';

exports.handler = async function(event, context) {
  try {
    // Try to get data from cache first
    const cachedData = cache.get('incidents');
    if (cachedData) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'max-age=300',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(cachedData)
      };
    }

    // Fetch fresh data if not in cache
    const [vercelResponse, netlifyResponse] = await Promise.all([
      axios.get(VERCEL_INCIDENTS_URL),
      axios.get(NETLIFY_INCIDENTS_URL)
    ]);

    // Process and format the data
    const data = {
      vercel: vercelResponse.data,
      netlify: netlifyResponse.data
    };

    // Store in cache
    cache.set('incidents', data);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=300',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('Error fetching incidents:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Failed to fetch incidents data' })
    };
  }
};