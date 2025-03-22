const axios = require('axios');
const NodeCache = require('node-cache');

// Create a cache with a 1-hour TTL
const cache = new NodeCache({ stdTTL: 3600 });

// Reddit API endpoints
const REDDIT_SEARCH_URL = 'https://www.reddit.com/search.json';

// Exact search queries that must include both terms
const SEARCH_QUERIES = [
  '"vercel vs netlify"',
  '"netlify vs vercel"',
  '"vercel netlify comparison"',
  '"netlify vercel comparison"',
  '"vercel or netlify"',
  '"netlify or vercel"',
  'title:"vercel" AND title:"netlify"'
];

// List of programming subreddits to search
const PROGRAMMING_SUBREDDITS = [
  'webdev',
  'reactjs',
  'nextjs',
  'javascript',
  'jamstack',
  'vercel',
  'netlify'
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

    // Get posts from subreddit searches
    const subredditPromises = [];
    for (const subreddit of PROGRAMMING_SUBREDDITS) {
      subredditPromises.push(searchSubreddit(subreddit, 'vercel AND netlify', 50));
    }
    
    // Get posts from general searches
    const searchPromises = SEARCH_QUERIES.map(query => searchReddit(query, 30));
    
    // Wait for all searches to complete
    const [subredditResults, searchResults] = await Promise.all([
      Promise.all(subredditPromises),
      Promise.all(searchPromises)
    ]);
    
    // Combine and filter results
    const allResults = [...subredditResults.flat(), ...searchResults.flat()];
    let processedResults = [];
    
    // First pass: strict filtering with double verification
    processedResults = strictFilterResults(allResults);
    
    console.log(`Found ${processedResults.length} Reddit posts after strict filtering`);
    
    // Sort by quality and recency
    processedResults = sortByQuality(processedResults);
    
    // Store in cache
    cache.set('redditComments', processedResults);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=3600',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(processedResults)
    };
  } catch (error) {
    console.error('Error fetching Reddit data:', error);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=3600',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify([])
    };
  }
};

// Filter results with strict criteria
function strictFilterResults(results) {
  // Deduplicate by ID
  const uniqueResults = {};
  for (const item of results) {
    if (item && item.data && item.data.id) {
      uniqueResults[item.data.id] = item.data;
    }
  }
  
  // Filter with very strict criteria
  const filtered = [];
  for (const post of Object.values(uniqueResults)) {
    try {
      // Get normalized content
      const title = (post.title || '').toLowerCase();
      const selftext = (post.selftext || '').toLowerCase();
      
      // Extremely strict verification to ensure both terms exist
      if (containsBoth(title, 'vercel', 'netlify') || 
          (containsBoth(selftext, 'vercel', 'netlify') && 
           (title.includes('vercel') || title.includes('netlify')))) {
        
        // Additional quality filters
        if (isQualityPost(post)) {
          filtered.push({
            id: post.id,
            title: post.title || '',
            author: post.author || 'unknown',
            created: post.created_utc || 0,
            url: `https://www.reddit.com${post.permalink}`,
            subreddit: post.subreddit_name_prefixed || 'r/unknown',
            score: post.score || 0,
            num_comments: post.num_comments || 0,
            snippet: createSnippet(post)
          });
        }
      }
    } catch (err) {
      console.error('Error processing post:', err);
    }
  }
  
  return filtered;
}

// Check if a string contains both terms
function containsBoth(text, term1, term2) {
  if (!text) return false;
  return text.includes(term1) && text.includes(term2);
}

// Create a good snippet that highlights the comparison
function createSnippet(post) {
  if (!post.selftext || post.selftext.length < 10) {
    return post.title || '[No text content]';
  }
  
  // Try to find paragraph that mentions both
  const paragraphs = post.selftext.split(/\n\n+/);
  
  // Look for paragraphs that mention both terms
  for (const para of paragraphs) {
    const lower = para.toLowerCase();
    if (lower.includes('vercel') && lower.includes('netlify')) {
      return trimSnippet(para);
    }
  }
  
  // If no specific paragraph, use beginning of text
  return trimSnippet(post.selftext);
}

// Trim snippet to a reasonable length
function trimSnippet(text) {
  if (!text) return '';
  
  // Clean up excessive whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  // Truncate if needed
  if (text.length > 280) {
    return text.substring(0, 277) + '...';
  }
  
  return text;
}

// Determine if a post meets quality criteria
function isQualityPost(post) {
  // Reject spam or promotional content
  if (isSpamOrPromotion(post)) return false;
  
  // Ensure there's reasonable text content
  if (!post.selftext && post.num_comments < 2) return false;
  
  // Reject extremely downvoted content
  if (post.score < -2) return false;
  
  // Favor posts with good engagement
  if (post.num_comments > 0 || post.score > 3) return true;
  
  // Default accept
  return true;
}

// Check for spam or promotional content
function isSpamOrPromotion(post) {
  const title = (post.title || '').toLowerCase();
  const text = (post.selftext || '').toLowerCase();
  
  // Spam indicators
  const spamWords = ['buy', 'sell', 'offer', 'discount', 'coupon', 
                     'deal', 'price', 'cheap', 'free', 'promotion', 
                     'crypto', 'nft', 'token', 'investment'];
  
  // Check for promotional language
  for (const word of spamWords) {
    if ((title.includes(word) && title.includes('vercel') && title.includes('netlify')) ||
        (text.includes(word) && text.includes('vercel') && text.includes('netlify'))) {
      return true;
    }
  }
  
  return false;
}

// Sort by post quality and recency
function sortByQuality(posts) {
  return posts.sort((a, b) => {
    // Higher score for posts with both terms in title
    const aTitleScore = containsBoth(a.title.toLowerCase(), 'vercel', 'netlify') ? 100 : 0;
    const bTitleScore = containsBoth(b.title.toLowerCase(), 'vercel', 'netlify') ? 100 : 0;
    
    // Higher score for recent and popular posts
    const aScore = aTitleScore + (a.score * 0.5) + (a.num_comments * 2) + (a.created / 10000000);
    const bScore = bTitleScore + (b.score * 0.5) + (b.num_comments * 2) + (b.created / 10000000);
    
    return bScore - aScore;
  });
}

// Search Reddit with a specific query
async function searchReddit(query, limit = 30) {
  try {
    const response = await axios.get(REDDIT_SEARCH_URL, {
      params: {
        q: query,
        limit: limit,
        sort: 'relevance',
        t: 'year'
      },
      headers: {
        'User-Agent': 'netlify-vercel-status-tracker/1.0.0'
      }
    });

    if (response.data && response.data.data && response.data.data.children) {
      return response.data.data.children;
    }
    
    return [];
  } catch (error) {
    console.error(`Error searching Reddit for "${query}":`, error);
    return [];
  }
}

// Search a specific subreddit
async function searchSubreddit(subreddit, query, limit = 30) {
  try {
    const response = await axios.get(`https://www.reddit.com/r/${subreddit}/search.json`, {
      params: {
        q: query,
        restrict_sr: true,
        limit: limit,
        sort: 'relevance',
        t: 'year'
      },
      headers: {
        'User-Agent': 'netlify-vercel-status-tracker/1.0.0'
      }
    });

    if (response.data && response.data.data && response.data.data.children) {
      return response.data.data.children;
    }
    
    return [];
  } catch (error) {
    console.error(`Error searching subreddit r/${subreddit}:`, error);
    return [];
  }
}