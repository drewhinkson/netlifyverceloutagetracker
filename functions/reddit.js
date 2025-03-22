const axios = require('axios');
const NodeCache = require('node-cache');
const qs = require('querystring');

// Create a cache with a 1-hour TTL
const cache = new NodeCache({ stdTTL: 3600 });

// Cache for the OAuth token - tokens typically last 1 hour
const tokenCache = new NodeCache({ stdTTL: 3500 }); // Set slightly less than 1 hour to be safe

exports.handler = async function(event, context) {
  try {
    // Check cache first for Reddit data
    const cachedData = cache.get('redditComments');
    if (cachedData) {
      console.log("Returning cached data with", cachedData.length, "items");
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'max-age=3600',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(cachedData)
      };
    }

    console.log("Cache miss - fetching fresh data from Reddit API");

    // Get or refresh OAuth token
    let token = tokenCache.get('redditToken');
    if (!token) {
      console.log("No token in cache, getting new token");
      token = await getRedditToken();
      tokenCache.set('redditToken', token);
    }

    // Search for posts using multiple relevant queries
    const allPosts = [];
    
    // List of search queries to try
    const searchQueries = [
      'vercel AND netlify',
      'title:vercel AND title:netlify',
      '"vercel vs netlify"',
      '"netlify vs vercel"',
      'vercel netlify comparison'
    ];
    
    // Try each search query
    for (const query of searchQueries) {
      try {
        console.log(`Searching Reddit for: ${query}`);
        const posts = await searchReddit(token, query);
        
        if (posts && posts.length > 0) {
          console.log(`Found ${posts.length} posts for query: ${query}`);
          allPosts.push(...posts);
        }
      } catch (searchError) {
        console.error(`Error searching for "${query}":`, searchError.message);
        
        // If token expired, try to get a new one and retry once
        if (searchError.response && searchError.response.status === 401) {
          try {
            console.log("Token expired, getting new token and retrying");
            token = await getRedditToken();
            tokenCache.set('redditToken', token);
            
            const retryPosts = await searchReddit(token, query);
            if (retryPosts && retryPosts.length > 0) {
              allPosts.push(...retryPosts);
            }
          } catch (retryError) {
            console.error("Retry failed:", retryError.message);
          }
        }
      }
    }
    
    // Also search in specific subreddits
    const subreddits = ['webdev', 'reactjs', 'nextjs', 'javascript', 'vercel', 'netlify'];
    
    for (const subreddit of subreddits) {
      try {
        console.log(`Searching subreddit: r/${subreddit}`);
        const posts = await searchSubreddit(token, subreddit, 'vercel AND netlify');
        
        if (posts && posts.length > 0) {
          console.log(`Found ${posts.length} posts in r/${subreddit}`);
          allPosts.push(...posts);
        }
      } catch (subredditError) {
        console.error(`Error searching r/${subreddit}:`, subredditError.message);
      }
    }
    
    // Process the posts to find relevant ones
    console.log(`Total posts collected: ${allPosts.length}`);
    const relevantPosts = processRedditPosts(allPosts);
    console.log(`Relevant posts after filtering: ${relevantPosts.length}`);
    
    // Store in cache
    cache.set('redditComments', relevantPosts);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=3600',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(relevantPosts)
    };
  } catch (error) {
    console.error('Error in Reddit function:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data).substring(0, 500));
    }
    
    return {
      statusCode: 200, // Return 200 with empty array
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify([])
    };
  }
};

// Get OAuth token from Reddit
async function getRedditToken() {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME;
  const password = process.env.REDDIT_PASSWORD;
  
  if (!clientId || !clientSecret || !username || !password) {
    throw new Error('Missing Reddit API credentials. Set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, and REDDIT_PASSWORD environment variables.');
  }
  
  console.log(`Getting token for client ID: ${clientId.substring(0, 5)}...`);
  
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  try {
    const response = await axios.post('https://www.reddit.com/api/v1/access_token', 
      qs.stringify({
        grant_type: 'password',
        username: username,
        password: password
      }),
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': `VercelNetlifyTracker/1.0 by ${username}`
        }
      }
    );
    
    if (!response.data || !response.data.access_token) {
      console.error('Invalid token response:', JSON.stringify(response.data));
      throw new Error('Failed to get access token');
    }
    
    console.log('Successfully got access token');
    return response.data.access_token;
  } catch (error) {
    console.error('Error getting access token:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data));
    }
    throw error;
  }
}

// Search Reddit with a query
async function searchReddit(token, query, limit = 30, timeRange = 'year') {
  try {
    const response = await axios.get('https://oauth.reddit.com/search', {
      params: {
        q: query,
        sort: 'relevance',
        t: timeRange,
        limit: limit
      },
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': `VercelNetlifyTracker/1.0 by ${process.env.REDDIT_USERNAME}`
      }
    });
    
    if (response.data && response.data.data && response.data.data.children) {
      return response.data.data.children;
    }
    
    return [];
  } catch (error) {
    console.error(`Error searching Reddit for "${query}":`, error.message);
    throw error;
  }
}

// Search specific subreddit
async function searchSubreddit(token, subreddit, query, limit = 30) {
  try {
    const response = await axios.get(`https://oauth.reddit.com/r/${subreddit}/search`, {
      params: {
        q: query,
        restrict_sr: true,
        sort: 'relevance',
        t: 'year',
        limit: limit
      },
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': `VercelNetlifyTracker/1.0 by ${process.env.REDDIT_USERNAME}`
      }
    });
    
    if (response.data && response.data.data && response.data.data.children) {
      return response.data.data.children;
    }
    
    return [];
  } catch (error) {
    console.error(`Error searching r/${subreddit} for "${query}":`, error.message);
    throw error;
  }
}

// Process Reddit posts to find relevant ones
function processRedditPosts(posts) {
  try {
    // Filter for posts mentioning both Vercel and Netlify
    const relevantPosts = [];
    const seenAuthors = new Set();
    const seenIds = new Set();
    
    for (const post of posts) {
      if (!post || !post.data) continue;
      
      const postData = post.data;
      
      // Skip if we've already processed this post
      if (seenIds.has(postData.id)) continue;
      seenIds.add(postData.id);
      
      const title = (postData.title || '').toLowerCase();
      const selftext = (postData.selftext || '').toLowerCase();
      
      // Check if both Vercel AND Netlify are mentioned
      if ((title.includes('vercel') || selftext.includes('vercel')) && 
          (title.includes('netlify') || selftext.includes('netlify'))) {
        
        // Skip if we already have a post from this author
        if (seenAuthors.has(postData.author)) continue;
        
        // Add additional quality filters
        if (title.includes('ups') && !title.includes('vercel') && !title.includes('netlify')) {
          // Skip UPS related posts that don't have the keywords in title
          continue;
        }
        
        // Skip very low-quality posts
        if (postData.score < -2 && postData.num_comments === 0) {
          continue;
        }
        
        // Add author to seen set
        seenAuthors.add(postData.author);
        
        // Format the post data
        relevantPosts.push({
          id: postData.id,
          title: postData.title || '',
          author: postData.author || 'unknown',
          created: postData.created_utc || 0,
          url: `https://www.reddit.com${postData.permalink}`,
          subreddit: postData.subreddit_name_prefixed || 'r/unknown',
          score: postData.score || 0,
          num_comments: postData.num_comments || 0,
          snippet: createSnippet(postData.selftext || postData.title || '')
        });
        
        // Limit to 10 posts
        if (relevantPosts.length >= 10) break;
      }
    }
    
    return relevantPosts;
  } catch (error) {
    console.error("Error processing posts:", error);
    return [];
  }
}

// Create a snippet from the post text
function createSnippet(text) {
  if (!text) return "";
  
  // Clean up the text
  text = text.replace(/\n{2,}/g, '\n\n').trim();
  
  // Truncate if needed
  if (text.length > 280) {
    return text.substring(0, 277) + '...';
  }
  
  return text;
}