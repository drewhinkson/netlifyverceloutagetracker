const axios = require('axios');
const NodeCache = require('node-cache');

// Create a cache with a 1-hour TTL
const cache = new NodeCache({ stdTTL: 3600 });

// Use Reddit's public JSON API instead of the official API
// This is more permissive and doesn't require authentication
const REDDIT_BASE_URL = 'https://www.reddit.com';

// Subreddits to search
const PROGRAMMING_SUBREDDITS = [
  'webdev',
  'reactjs',
  'nextjs',
  'javascript',
  'programming',
  'vercel',
  'netlify',
  'jamstack'
];

exports.handler = async function(event, context) {
  try {
    // Check cache first
    const cachedData = cache.get('redditComments');
    if (cachedData) {
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
    
    // Try to search each programming subreddit
    const allPosts = [];
    
    for (const subreddit of PROGRAMMING_SUBREDDITS) {
      try {
        // Use the public JSON API
        const response = await axios.get(`${REDDIT_BASE_URL}/r/${subreddit}/search.json`, {
          params: {
            q: "vercel netlify",
            restrict_sr: true,
            sort: "relevance",
            t: "year",
            limit: 15
          },
          headers: {
            // Use a valid user agent
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)'
          },
          timeout: 5000 // 5 seconds timeout
        });
        
        if (response.data && response.data.data && response.data.data.children) {
          console.log(`Got ${response.data.data.children.length} results from r/${subreddit}`);
          allPosts.push(...response.data.data.children);
        }
      } catch (subError) {
        console.log(`Error searching r/${subreddit}:`, subError.message);
      }
    }
    
    // Process the posts
    if (allPosts.length > 0) {
      console.log(`Total posts found from Reddit: ${allPosts.length}`);
      const processedPosts = processRedditPosts(allPosts);
      console.log(`After processing: ${processedPosts.length} posts`);
      
      // Store in cache (even if empty)
      cache.set('redditComments', processedPosts);
      
      // Return the posts (or empty array)
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'max-age=3600',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(processedPosts)
      };
    }
    
    // If we got here, no posts were found
    console.log("No relevant posts found");
    cache.set('redditComments', []);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=3600',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify([])
    };
  } catch (error) {
    console.error('Error in Reddit function:', error);
    
    return {
      statusCode: 200, // Still return 200 with empty array
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
      
      // Check if both Vercel and Netlify are mentioned
      if ((title.includes('vercel') || selftext.includes('vercel')) && 
          (title.includes('netlify') || selftext.includes('netlify'))) {
        
        // Skip if we already have a post from this author
        if (seenAuthors.has(postData.author)) continue;
        
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