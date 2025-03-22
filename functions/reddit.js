const axios = require('axios');
const NodeCache = require('node-cache');

// Create a cache with a 1-hour TTL
const cache = new NodeCache({ stdTTL: 3600 });

// Use Reddit's public non-API endpoint which is more permissive
// This endpoint is less likely to be rate-limited or blocked
const REDDIT_SEARCH_URL = 'https://www.reddit.com/search/.json';

exports.handler = async function(event, context) {
  try {
    // Check cache first
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

    console.log("Cache miss - fetching fresh data");
    
    // Define search parameters
    const searchParams = new URLSearchParams({
      q: 'title:vercel AND title:netlify OR "vercel vs netlify" OR "netlify vs vercel"',
      t: 'year',
      sort: 'relevance',
      limit: '50'
    });
    
    // Fetch data from Reddit's non-API JSON endpoint
    const response = await axios.get(`${REDDIT_SEARCH_URL}?${searchParams.toString()}`, {
      headers: {
        // Use a more realistic user agent that's less likely to be blocked
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.82 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0'
      },
      timeout: 8000 // Increase timeout to 8 seconds
    });
    
    // Check if we got a valid response
    if (!response.data || !response.data.data || !response.data.data.children) {
      console.log("Invalid response structure:", JSON.stringify(response.data).substring(0, 200));
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify([])
      };
    }
    
    // Process posts
    const allPosts = response.data.data.children;
    console.log(`Retrieved ${allPosts.length} posts from Reddit`);
    
    // Filter and process posts
    const processedPosts = processRedditPosts(allPosts);
    console.log(`After processing: ${processedPosts.length} posts`);
    
    // Store in cache (even if empty)
    cache.set('redditComments', processedPosts);
    
    // Return the posts
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=3600',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(processedPosts)
    };
  } catch (error) {
    console.error('Error in Reddit function:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', JSON.stringify(error.response.headers));
      console.error('Response data:', JSON.stringify(error.response.data).substring(0, 500));
    }
    
    // Return empty array
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify([])
    };
  }
};

// Process Reddit posts to find relevant ones
function processRedditPosts(posts) {
  try {
    // Filter for posts mentioning both Vercel and Netlify
    const relevantPosts = [];
    const seenAuthors = new Set();
    
    for (const post of posts) {
      if (!post || !post.data) continue;
      
      const postData = post.data;
      const title = (postData.title || '').toLowerCase();
      const selftext = (postData.selftext || '').toLowerCase();
      
      // Check if both Vercel AND Netlify are mentioned
      if ((title.includes('vercel') || selftext.includes('vercel')) && 
          (title.includes('netlify') || selftext.includes('netlify'))) {
        
        // Skip if we already have a post from this author
        if (seenAuthors.has(postData.author)) continue;
        
        // Skip posts that aren't actually talking about both (additional filter)
        if (title.includes('ups') && !title.includes('vercel') && !title.includes('netlify')) {
          continue;
        }
        
        // Skip posts with very little engagement
        if (postData.score < 0 && postData.num_comments < 2) {
          continue;
        }
        
        // Add author to seen set
        seenAuthors.add(postData.author);
        
        // Format the post data
        relevantPosts.push({
          id: postData.id,
          title: postData.title,
          author: postData.author,
          created: postData.created_utc,
          url: `https://www.reddit.com${postData.permalink}`,
          subreddit: postData.subreddit_name_prefixed,
          score: postData.score,
          num_comments: postData.num_comments,
          snippet: createSnippet(postData.selftext || postData.title)
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